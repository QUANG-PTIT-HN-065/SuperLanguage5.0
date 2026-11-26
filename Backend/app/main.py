import logging
import threading
import time

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.api.endpoints import (
    admin,
    auth,
    chat_ai,
    leaderboard,
    lessons,
    minigame,
    shop,
    users,
    vocabulary,
    writing,
)
from app.core.config import settings
from app.core.exception import AppException
from app.db.supabase import supabase_admin

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Danh sách Origin chuẩn hóa (loại bỏ khoảng trắng và dấu '/' ở cuối)
_cors_origins = list(
    dict.fromkeys(
        origin.strip().rstrip("/")
        for origin in [
            *settings.BACKEND_CORS_ORIGINS,
            "https://www.superlanguage.me",
            "https://superlanguage.me",
            "http://localhost:5173",
            "http://localhost:3000",
        ]
        if origin and origin.strip()
    )
)


def _apply_cors_headers(request: Request, response: JSONResponse) -> JSONResponse:
    """Gắn header CORS vào response phát sinh từ exception handler."""
    origin = request.headers.get("origin")
    if origin and origin.strip().rstrip("/") in _cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# Tích hợp các Router vào hệ thống API
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(users.router, prefix=f"{settings.API_V1_STR}/me", tags=["me"])
app.include_router(chat_ai.router, prefix=f"{settings.API_V1_STR}/chat-ai", tags=["Chat_AI"])
app.include_router(
    vocabulary.router,
    prefix=f"{settings.API_V1_STR}/vocabulary",
    tags=["vocabulary"],
)
app.include_router(
    lessons.router,
    prefix=f"{settings.API_V1_STR}/lessons",
    tags=["lessons"],
)
app.include_router(
    minigame.router,
    prefix=f"{settings.API_V1_STR}/minigame",
    tags=["Mini-game"],
)
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"])
app.include_router(
    writing.router,
    prefix=f"{settings.API_V1_STR}/writing",
    tags=["writing"],
)
app.include_router(shop.router, prefix=f"{settings.API_V1_STR}/shop", tags=["shop"])
app.include_router(
    leaderboard.router,
    prefix=f"{settings.API_V1_STR}/leaderboard",
    tags=["leaderboard"],
)


def _run_inactive_account_cleanup_worker() -> None:
    """Nền định kỳ xóa tài khoản đã hết thời hạn cảnh báo 7 ngày."""
    from app.services.admin import process_inactive_account_deletions

    while True:
        try:
            process_inactive_account_deletions()
        except Exception as exc:
            logger.warning("Không thể chạy tác vụ xóa tài khoản không hoạt động: %s", exc)
        time.sleep(6 * 60 * 60)


@app.on_event("startup")
def start_inactive_account_cleanup_worker() -> None:
    # Chỉ chạy worker dọn dẹp trên môi trường cloud (Render), tránh chạy trùng ở local worker
    if not getattr(settings, "USE_LOCAL_WHISPER", False):
        worker = threading.Thread(
            target=_run_inactive_account_cleanup_worker,
            name="inactive-account-cleanup",
            daemon=True,
        )
        worker.start()


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": f"Welcome to {settings.PROJECT_NAME} API!",
        "version": settings.VERSION,
    }


@app.get("/health")
def health_check():
    is_local = bool(getattr(settings, "USE_LOCAL_WHISPER", False))
    return {"status": "ok", "mode": "local" if is_local else "render"}


# Đăng ký CORSMiddleware CUỐI CÙNG (outermost) để bọc toàn bộ ứng dụng
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/test-supabase")
def test_supabase_connection():
    try:
        supabase_admin.auth.get_session()
        return {
            "status": "success",
            "message": "Kết nối Supabase thành công!",
            "supabase_url": settings.SUPABASE_URL,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Lỗi kết nối Supabase: {str(e)}"
        )


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return _apply_cors_headers(
        request,
        JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.message,
                "data": None,
                "error": {
                    "code": exc.error_code,
                    "detail": str(exc),
                },
            },
        ),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = getattr(exc, "headers", None) or {}
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )
    return _apply_cors_headers(request, response)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    response = JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )
    return _apply_cors_headers(request, response)


@app.exception_handler(httpx.TransportError)
async def supabase_transport_error_handler(request: Request, exc: httpx.TransportError):
    logger.error(
        "Supabase transport failure on %s %s: %s",
        request.method,
        request.url.path,
        exc,
    )
    message = (
        "Không thể kết nối Supabase (lỗi DNS/mạng). "
        "Kiểm tra kết nối internet, DNS hoặc trạng thái project Supabase rồi thử lại."
    )
    return _apply_cors_headers(
        request,
        JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "message": message,
                "data": None,
                "detail": message,
            },
        ),
    )
