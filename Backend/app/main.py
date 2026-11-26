import logging
import threading
import time

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.db.supabase import supabase_admin

from app.api.endpoints import admin, auth, users, vocabulary, chat_ai, lessons, minigame, shop, leaderboard, writing



from app.core.exception import AppException

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Cấu hình CORS Middleware cho phép kết nối từ Frontend (Vite/React/HTML)
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class CorsSafetyNetMiddleware(BaseHTTPMiddleware):
    """Safety-net middleware đảm bảo mọi response đều có header CORS.

    Starlette CORSMiddleware đôi khi không gắn Access-Control-Allow-Origin
    cho các response phát sinh từ route chạy lâu (như transcribe giọng nói)
    hoặc từ exception handler. Middleware này chạy ngoài cùng và kiểm tra lại,
    nếu thiếu header thì bổ sung dựa trên Origin của request.
    """

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        try:
            response = await call_next(request)
        except Exception:
            # Giữ nguyên exception để exception handler của app xử lý,
            # nhưng đảm bảo response cuối cùng có CORS header.
            raise

        if origin and origin in settings.BACKEND_CORS_ORIGINS:
            if "access-control-allow-origin" not in {
                k.lower() for k in response.headers
            }:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Vary"] = "Origin"
        return response


if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(CorsSafetyNetMiddleware)


def _apply_cors_headers(request: Request, response: JSONResponse) -> JSONResponse:
    """Gắn header CORS vào response từ exception handler (vòng bảo vệ thứ 2)."""
    origin = request.headers.get("origin")
    if origin and origin in settings.BACKEND_CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

# Tích hợp Auth Router vào hệ thống API 
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
    return _apply_cors_headers(request, JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "error": {
                "code": exc.error_code,
                "detail": str(exc)
            }
        }
    ))


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
        request.method, request.url.path, exc,
    )
    message = (
        "Không thể kết nối Supabase (lỗi DNS/mạng). "
        "Kiểm tra kết nối internet, DNS hoặc trạng thái project Supabase rồi thử lại."
    )
    return _apply_cors_headers(request, JSONResponse(
        status_code=503,
        content={"status": "error", "message": message, "data": None, "detail": message},
    ))