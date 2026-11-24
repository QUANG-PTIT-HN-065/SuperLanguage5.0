import logging
from typing import Any, Dict, NoReturn, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import get_bearer_token
from app.core.login_rate_limit import check_login_rate_limit
from app.db.supabase import new_auth_client, supabase_admin
from app.schemas.reponse import BaseResponse
from app.schemas.auth import (
    EmailRequest,
    LoginRequest,
    LogoutRequest,
    OTPVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordOtpRequest,
)
from app.services import recovery_otp_service
from app.services.profile_service import (
    get_profile,
    now_iso,
    touch_last_sign_in,
    validate_languages,
)
from app.services.vocabulary_service import effective_plan_id

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def _raise_auth_error(exc: Exception, default_status: int, default_msg: str) -> NoReturn:
    """Đổi lỗi Supabase Auth thành thông báo thân thiện; lỗi gốc chỉ ghi log."""
    upstream_status = getattr(exc, "status", None) or getattr(exc, "status_code", None)
    exception_name = type(exc).__name__.lower()
    logger.warning(
        "Supabase Auth request failed (exception=%s, upstream_status=%s)",
        type(exc).__name__,
        upstream_status,
    )
    msg = str(exc).lower()

    if upstream_status == status.HTTP_429_TOO_MANY_REQUESTS or any(
        text in msg for text in ("rate limit", "too many", "security purposes")
    ):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
        ) from exc

    is_upstream_error = isinstance(upstream_status, int) and upstream_status >= 500
    is_transient_error = any(
        text in exception_name for text in ("retryable", "timeout", "connection", "network")
    )
    if is_upstream_error or is_transient_error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Dịch vụ xác thực đang tạm thời không khả dụng. Vui lòng thử lại sau.",
        ) from exc

    if "already registered" in msg or "already been registered" in msg:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email này đã được đăng ký.") from exc
    if "banned" in msg:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        ) from exc
    if "not confirmed" in msg:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Email chưa được xác thực. Vui lòng kiểm tra hộp thư."
        ) from exc
    if "password" in msg and any(w in msg for w in ("weak", "least", "short", "characters")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Mật khẩu chưa đủ mạnh.") from exc
    raise HTTPException(default_status, default_msg) from exc


def _tokens(session: Any) -> Dict[str, Any]:
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "token_type": "bearer",
        "expires_in": session.expires_in,
    }


def _lookup_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Tra user theo email qua gotrue admin REST (supabase-py bản này không có
    get_user_by_email; tham số ?email= cũng bị ignore nên phải lọc thủ công)."""
    target = email.strip().lower()
    page = 1
    try:
        while True:
            response = httpx.get(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users",
                headers={
                    "apikey": settings.SUPABASE_SECRET_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
                },
                params={"page": page, "per_page": 1000},
                timeout=30,
            )
            if response.status_code != 200:
                logger.warning("Tra user theo email trả về HTTP %s", response.status_code)
                return None
            data = response.json()
            for user in data.get("users") or []:
                if (user.get("email") or "").strip().lower() == target:
                    return user
            if not data.get("has_next_page"):
                return None
            page += 1
    except httpx.HTTPError:
        logger.exception("Lỗi kết nối khi tra user theo email")
        return None


def _session_response(session: Any, user_id: str, require_admin: bool = False) -> Dict[str, Any]:
    """Kiểm tra tài khoản còn hoạt động, ghi nhận đăng nhập, trả token + tóm tắt hồ sơ."""
    profile = get_profile(user_id)
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được khởi tạo hồ sơ.")
    if profile["status"] != "active" or profile.get("deleted_at"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa hoặc vô hiệu hóa.")
    if require_admin and profile["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản không có quyền truy cập trang quản trị.")

    touch_last_sign_in(user_id)

    return {
        "status": "success",
        "message": "Đăng nhập thành công.",
        "data": {
            **_tokens(session),
            "user": {
                "id": profile["id"],
                "email": profile["email"],
                "username": profile["username"],
                "display_name": profile["display_name"],
                "avatar_url": profile["avatar_url"],
                "role": profile["role"],
                "plan_id": effective_plan_id(profile),
                "status": profile.get("status", "active"),
            },
            "needs_onboarding": profile["onboarding_completed_at"] is None,
        },
        "error": None,
    }


# ---------------------------------------------------------------------
# Đăng ký
# ---------------------------------------------------------------------
@router.post(
    "/register",
    response_model=BaseResponse[Dict[str, Any]],
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest):
    """
    Đăng ký tài khoản:
    1. Kiểm tra ngôn ngữ hợp lệ (trước khi tạo user, tránh tạo xong mới lỗi).
    2. Tạo user ở Supabase Auth -> trigger tự tạo profiles + user_stats.
    3. Ghi ngôn ngữ đã chọn và thời điểm đồng ý điều khoản vào profiles.
    """
    validate_languages(data.native_language, data.target_language)

    metadata: Dict[str, Any] = {}
    if data.display_name:
        metadata["display_name"] = data.display_name

    client = new_auth_client()
    try:
        response = client.auth.sign_up(
            {
                "email": str(data.email),
                "password": data.password,
                "options": {"data": metadata},
            }
        )
    except Exception as exc:
        _raise_auth_error(exc, status.HTTP_400_BAD_REQUEST, "Đăng ký thất bại. Vui lòng thử lại.")

    user = response.user
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đăng ký thất bại. Vui lòng thử lại.")

    # Khi bật "Confirm email", email đã tồn tại sẽ trả về user giả với identities rỗng
    if user.identities is not None and len(user.identities) == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email này đã được đăng ký.")

    try:
        supabase_admin.table("profiles").update(
            {
                "native_language": data.native_language,
                "target_language": data.target_language,
                "terms_accepted_at": now_iso(),
            }
        ).eq("id", user.id).execute()
    except Exception:
        # Không làm hỏng đăng ký; người dùng vẫn chọn lại được ở bước onboarding
        logger.exception("Không ghi được ngôn ngữ/điều khoản cho user %s", user.id)

    message = (
        "Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản."
        if response.session is None
        else "Đăng ký thành công!"
    )
    result: Dict[str, Any] = {
        "user_id": user.id,
        "email": user.email,
        "email_confirmation_required": response.session is None,
        "needs_onboarding": True,
    }
    if response.session is not None:
        result.update(_tokens(response.session))
    return {"status": "success", "message": message, "data": result, "error": None}


# ---------------------------------------------------------------------
# Đăng nhập / làm mới token / đăng xuất
# ---------------------------------------------------------------------
@router.post("/login", response_model=BaseResponse[Dict[str, Any]])
def login(data: LoginRequest, request: Request):
    client = new_auth_client()
    try:
        response = client.auth.sign_in_with_password(
            {"email": str(data.email), "password": data.password}
        )
    except Exception as exc:
        _raise_auth_error(exc, status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.")

    if not response.session or not response.user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.")

    return _session_response(response.session, response.user.id)


@router.post("/admin/login", response_model=BaseResponse[Dict[str, Any]])
def admin_login(data: LoginRequest, request: Request):
    """Đăng nhập riêng cho trang quản trị; chỉ trả token cho tài khoản admin."""
    check_login_rate_limit(request, str(data.email))
    client = new_auth_client()
    try:
        response = client.auth.sign_in_with_password(
            {"email": str(data.email), "password": data.password}
        )
    except Exception as exc:
        _raise_auth_error(exc, status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.")

    if not response.session or not response.user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không chính xác.")

    return _session_response(response.session, response.user.id, require_admin=True)


@router.post("/refresh", response_model=BaseResponse[Dict[str, Any]])
def refresh(data: RefreshRequest):
    client = new_auth_client()
    try:
        response = client.auth.refresh_session(data.refresh_token)
    except Exception as exc:
        _raise_auth_error(
            exc,
            status.HTTP_401_UNAUTHORIZED,
            "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        )

    if not response.session:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        )
    return {
        "status": "success",
        "message": "Phiên đăng nhập đã được làm mới.",
        "data": _tokens(response.session),
        "error": None,
    }


@router.post("/logout", response_model=BaseResponse[None])
def logout(data: LogoutRequest | None = None, token: str = Depends(get_bearer_token)):
    """Thu hồi phiên đăng nhập hiện tại.

    Hỗ trợ cả luồng cũ dùng bearer token và luồng mới nhận refresh_token trong body.
    Nếu refresh_token hết hạn hoặc không hợp lệ, logout vẫn coi như thành công theo nguyên tắc idempotent.
    """
    refresh_token = (data.refresh_token if data else None) or ""
    active_token = token

    if refresh_token:
        client = new_auth_client()
        try:
            session = client.auth.refresh_session(refresh_token)
            active_token = getattr(session.session, "access_token", None) or token
        except Exception as exc:  # pragma: no cover - logic validated via unit tests
            status_code = getattr(exc, "status", None) or getattr(exc, "status_code", None)
            if status_code == status.HTTP_401_UNAUTHORIZED:
                return {
                    "status": "success",
                    "message": "Đã đăng xuất.",
                    "data": None,
                    "error": None,
                }
            if isinstance(status_code, int):
                raise HTTPException(status_code, "Không thể đăng xuất do lỗi xác thực.") from exc
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Dịch vụ xác thực đang tạm thời không khả dụng.") from exc

    if not active_token:
        return {
            "status": "success",
            "message": "Đã đăng xuất.",
            "data": None,
            "error": None,
        }

    try:
        supabase_admin.auth.admin.sign_out(active_token, "local")
    except Exception:
        # Token có thể đã hết hạn; client vẫn nên xóa token ở phía mình
        logger.info("Logout: không thu hồi được token (có thể đã hết hạn).")
    return {
        "status": "success",
        "message": "Đã đăng xuất.",
        "data": None,
        "error": None,
    }


# ---------------------------------------------------------------------
# Đăng nhập bằng OTP (chỉ cho tài khoản đã tồn tại)
# ---------------------------------------------------------------------
@router.post("/send-otp", response_model=BaseResponse[Dict[str, bool]])
def send_otp(data: EmailRequest):
    client = new_auth_client()
    try:
        client.auth.sign_in_with_otp(
            {"email": str(data.email), "options": {"should_create_user": False}}
        )
    except Exception as exc:
        code = str(getattr(exc, "code", "") or "").lower()
        msg = str(exc).lower()
        if code in {"user_not_found", "email_not_found"} or any(
            text in msg for text in ("user not found", "email not found")
        ):
            logger.info("OTP request ignored for an unregistered email.")
        else:
            _raise_auth_error(
                exc,
                status.HTTP_502_BAD_GATEWAY,
                "Không thể gửi mã OTP lúc này. Vui lòng thử lại sau.",
            )

    return {
        "status": "success",
        "message": "Nếu email hợp lệ, mã OTP đã được gửi tới hộp thư của bạn.",
        "data": {"sent": True},
        "error": None,
    }


@router.post("/recover", response_model=BaseResponse[Dict[str, bool]])
def recover(data: EmailRequest):
    """Gửi email chứa mã OTP 8 số để khôi phục mật khẩu.

    Email không tồn tại cũng nhận phản hồi thành công giống hệt (chống dò email).
    """
    email = str(data.email)
    user = _lookup_user_by_email(email)
    if not user or not user.get("id"):
        return {
            "status": "success",
            "message": "Nếu email hợp lệ, mã OTP đã được gửi tới hộp thư của bạn.",
            "data": {"sent": True},
            "error": None,
        }

    code = recovery_otp_service.create(email)
    try:
        recovery_otp_service.send_otp_email(email, code)
    except Exception as exc:
        logger.exception("Gửi email OTP khôi phục thất bại")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Không thể gửi email OTP lúc này. Vui lòng thử lại sau.",
        ) from exc

    return {
        "status": "success",
        "message": "Nếu email hợp lệ, mã OTP đã được gửi tới hộp thư của bạn.",
        "data": {"sent": True},
        "error": None,
    }


@router.post("/resend-signup-otp", response_model=BaseResponse[Dict[str, bool]])
def resend_signup_otp(data: EmailRequest):
    client = new_auth_client()
    try:
        client.auth.resend({"type": "signup", "email": str(data.email)})
    except Exception as exc:
        _raise_auth_error(
            exc,
            status.HTTP_502_BAD_GATEWAY,
            "Không thể gửi lại mã xác thực lúc này. Vui lòng thử lại sau.",
        )

    return {
        "status": "success",
        "message": "Nếu tài khoản đang chờ xác thực, mã mới đã được gửi tới email.",
        "data": {"sent": True},
        "error": None,
    }


@router.post("/verify-otp", response_model=BaseResponse[Dict[str, Any]])
def verify_signup_otp(body: OTPVerifyRequest):
    auth_client = new_auth_client()
    try:
        # Xác thực mã OTP 8 chữ số người dùng nhập
        res = auth_client.auth.verify_otp({
            "email": body.email,
            "token": body.token,
            "type": "signup"
        })
        if res.session is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã OTP không hợp lệ hoặc đã hết hạn.",
            )
        return {
            "status": "success",
            "message": "Xác thực email thành công.",
            "data": {
                **_tokens(res.session),
                "user_id": res.user.id if res.user else None,
            },
            "error": None,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Mã OTP không hợp lệ hoặc đã hết hạn.")


# ---------------------------------------------------------------------
# Đặt lại mật khẩu bằng OTP đăng nhập (type "email")
# ---------------------------------------------------------------------
@router.post("/reset-password-otp", response_model=BaseResponse[None])
def reset_password_otp(data: ResetPasswordOtpRequest):
    """Khôi phục mật khẩu: verify mã OTP 8 số do app sinh (gửi qua /recover)
    rồi đổi mật khẩu. Mã chỉ dùng một lần, hết hạn 10 phút, tối đa 5 lần đoán."""
    if not recovery_otp_service.verify(str(data.email), data.token):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Mã OTP không hợp lệ hoặc đã hết hạn."
        )

    user = _lookup_user_by_email(str(data.email))
    if not user or not user.get("id"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản không tồn tại.")

    try:
        supabase_admin.auth.admin.update_user_by_id(user["id"], {"password": data.new_password})
    except Exception as exc:
        _raise_auth_error(
            exc,
            status.HTTP_502_BAD_GATEWAY,
            "Không thể đổi mật khẩu lúc này. Vui lòng thử lại sau.",
        )

    return {
        "status": "success",
        "message": "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.",
        "data": None,
        "error": None,
    }