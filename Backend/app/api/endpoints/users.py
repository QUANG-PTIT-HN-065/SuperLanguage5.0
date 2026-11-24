import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.deps import get_current_profile
from app.db.supabase import new_auth_client, supabase_admin
from app.schemas.dashboard import LearnerDashboard
from app.schemas.reponse import BaseResponse
from app.schemas.profile import ChangePasswordRequest, OnboardingRequest, ProfileUpdate
from app.services.cloudinary_service import (
    ALLOWED_IMAGE_TYPES,
    AVATAR_MAX_BYTES,
    CloudinaryNotConfiguredError,
    upload_avatar,
)
from app.services.dashboard_service import get_learner_dashboard
from app.services.profile_service import (
    complete_onboarding as complete_onboarding_profile,
    get_recent_daily_activity,
    get_plan,
    get_stats,
    get_streak_freeze_count,
    update_profile,
    with_effective_streak,
)
from app.services.vocabulary_service import effective_plan_id

router = APIRouter()
logger = logging.getLogger(__name__)
XP_PER_LEVEL = 100


def _me_payload(profile: Dict[str, Any]) -> BaseResponse[Dict[str, Any]]:
    stats = with_effective_streak(
        get_stats(profile["id"]),
        profile["timezone"],
        get_streak_freeze_count(profile["id"]),
    )
    return BaseResponse(
        status="success",
        message="Đã tải hồ sơ học tập.",
        data={
            "profile": profile,
            "stats": stats,
            "daily_activity": get_recent_daily_activity(profile["id"], profile["timezone"]),
            "plan": get_plan(effective_plan_id(profile)),
            "needs_onboarding": profile["onboarding_completed_at"] is None,
        },
    )


@router.get("", response_model=BaseResponse[Dict[str, Any]])
def get_me(profile: Dict[str, Any] = Depends(get_current_profile)):
    """Hồ sơ + thống kê (XP, chuỗi ngày) + gói hiện tại của người dùng đang đăng nhập."""
    return _me_payload(profile)


@router.get("/progress", response_model=BaseResponse[Dict[str, Any]])
def get_progress(profile: Dict[str, Any] = Depends(get_current_profile)):
    stats = with_effective_streak(
        get_stats(profile["id"]),
        profile["timezone"],
        get_streak_freeze_count(profile["id"]),
    )
    xp_total = max(0, int(stats.get("xp_total") or 0))
    return BaseResponse(
        status="success",
        message="Đã tải tiến độ học tập.",
        data={
            "xp_total": xp_total,
            "level": xp_total // XP_PER_LEVEL + 1,
            "xp_into_level": xp_total % XP_PER_LEVEL,
            "xp_per_level": XP_PER_LEVEL,
            "lessons_completed": int(stats.get("lessons_completed") or 0),
            "current_streak": int(stats.get("current_streak") or 0),
        },
    )


@router.get("/dashboard", response_model=BaseResponse[LearnerDashboard])
def get_dashboard(profile: Dict[str, Any] = Depends(get_current_profile)):
    return BaseResponse(
        status="success",
        message="Đã tải dữ liệu bảng điều khiển.",
        data=get_learner_dashboard(profile),
    )


@router.patch("", response_model=BaseResponse[Dict[str, Any]])
def update_me(body: ProfileUpdate, profile: Dict[str, Any] = Depends(get_current_profile)):
    """Cập nhật hồ sơ; chỉ các trường được gửi lên mới bị thay đổi."""
    data = body.model_dump(mode="json", exclude_unset=True)
    updated = update_profile(profile["id"], data)
    return _me_payload(updated)


@router.post("/onboarding", response_model=BaseResponse[Dict[str, Any]])
def complete_onboarding(
    body: OnboardingRequest, profile: Dict[str, Any] = Depends(get_current_profile)
):
    """Hoàn tất bước chọn ngôn ngữ, trình độ, mục tiêu sau khi đăng ký."""
    updated = complete_onboarding_profile(profile["id"], body.model_dump(mode="json"))
    return _me_payload(updated)


@router.post("/avatar", response_model=BaseResponse[Dict[str, Any]])
async def upload_avatar_endpoint(
    file: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Nhận ảnh JPG/PNG (<= 10MB), đẩy lên Cloudinary rồi lưu avatar_url."""
    content_type = (file.content_type or "").split(";", maxsplit=1)[0].strip().lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        await file.close()
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Chỉ chấp nhận ảnh JPG hoặc PNG.",
        )

    image_bytes = await file.read(AVATAR_MAX_BYTES + 1)
    await file.close()
    if not image_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File ảnh đang trống.")
    if len(image_bytes) > AVATAR_MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Ảnh vượt quá giới hạn 10MB.",
        )

    try:
        avatar_url = upload_avatar(image_bytes, profile["id"], content_type)
    except CloudinaryNotConfiguredError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Cloudinary chưa được cấu hình. Liên hệ quản trị viên để thêm khóa API.",
        ) from exc
    except Exception as exc:
        logger.exception("Không thể tải ảnh đại diện lên Cloudinary cho %s", profile["id"])
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Không thể tải ảnh lên lúc này. Vui lòng thử lại sau.",
        ) from exc

    updated = update_profile(profile["id"], {"avatar_url": avatar_url})
    return _me_payload(updated)


@router.post("/password", response_model=BaseResponse[Dict[str, Any]])
def change_password(
    body: ChangePasswordRequest, profile: Dict[str, Any] = Depends(get_current_profile)
):
    """Đổi mật khẩu: xác minh mật khẩu cũ qua Supabase rồi mới cập nhật mật khẩu mới."""
    client = new_auth_client()
    try:
        client.auth.sign_in_with_password(
            {"email": profile["email"], "password": body.old_password}
        )
    except Exception as exc:
        message = str(exc).lower()
        if "rate limit" in message or "too many" in message or "security purposes" in message:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
            ) from exc
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Mật khẩu cũ không chính xác."
        ) from exc

    try:
        supabase_admin.auth.admin.update_user_by_id(
            profile["id"], {"password": body.new_password}
        )
    except Exception as exc:
        logger.exception("Không thể cập nhật mật khẩu cho %s", profile["id"])
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Mật khẩu mới chưa đủ mạnh (tối thiểu 8 ký tự).",
        ) from exc

    return BaseResponse(
        status="success",
        message="Đổi mật khẩu thành công.",
        data={},
    )