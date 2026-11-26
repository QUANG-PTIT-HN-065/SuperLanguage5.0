import logging

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.supabase import supabase_admin

from app.api.endpoints import admin, auth, users, vocabulary, chat_ai, lessons, minigame, shop, leaderboard



from app.core.exception import AppException

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

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
app.include_router(shop.router, prefix=f"{settings.API_V1_STR}/shop", tags=["shop"])
app.include_router(
    leaderboard.router,
    prefix=f"{settings.API_V1_STR}/leaderboard",
    tags=["leaderboard"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": f"Welcome to {settings.PROJECT_NAME} API!",
        "version": settings.VERSION,
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "mode": "local" if settings.USE_LOCAL_WHISPER else "render"}


# Đăng ký CORSMiddleware CUỐI CÙNG (outermost) để luôn gắn CORS headers kể cả khi có lỗi
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
    return JSONResponse(
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
    )


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
    return JSONResponse(
        status_code=503,
        content={"status": "error", "message": message, "data": None, "detail": message},
    )