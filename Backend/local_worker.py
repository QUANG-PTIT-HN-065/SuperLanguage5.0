"""
Local AI Worker (Windows 11) for SuperLanguage 5.0.
Runs on port 8001 behind Cloudflare Tunnel (https://ai-local.superlanguage.me)
to offload heavy local Whisper / audio processing from Render Free Tier (512 MB RAM).

Usage:
    uvicorn local_worker:app --host 0.0.0.0 --port 8001
"""

import logging
import threading
from contextlib import asynccontextmanager
from typing import Any, Dict
from uuid import UUID

import uvicorn
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints.chat_ai import (
    send_voice_message,
    submit_reading_practice_answer,
    transcribe_chat_audio,
    transcribe_practice_audio,
)
from app.core.config import settings
from app.core.deps import get_current_profile
from app.schemas.chat_ai import (
    AudioTranscriptionResponse,
    MessageResponse,
    ReadingPracticeTurnResponse,
)
from app.schemas.reponse import BaseResponse
from app.services.speech_service import is_whisper_loaded, preload_local_model

logger = logging.getLogger(__name__)

# Force local Whisper + FFmpeg pipeline on this worker
settings.USE_LOCAL_WHISPER = True


@asynccontextmanager
async def lifespan(_app):
    # Preload Whisper in background so /health responds immediately
    threading.Thread(target=preload_local_model, daemon=True).start()
    yield


app = __import__("fastapi").FastAPI(
    title=f"{settings.PROJECT_NAME} — Local AI Worker",
    version=settings.VERSION,
    lifespan=lifespan,
)


def verify_local_worker_access(
    profile: Dict[str, Any] = Depends(get_current_profile),
    x_local_secret_key: str | None = Header(default=None, alias="X-Local-Secret-Key"),
) -> Dict[str, Any]:
    """Authenticate via Supabase JWT and optional X-Local-Secret-Key header."""
    expected_secret = (settings.LOCAL_WORKER_SECRET or "").strip()
    if expected_secret and x_local_secret_key != expected_secret:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Invalid X-Local-Secret-Key header.",
        )
    return profile


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "worker": "local-ai",
        "whisper_loaded": is_whisper_loaded(),
    }


local_chat_router = APIRouter(tags=["Local AI Audio Worker"])


@local_chat_router.post(
    "/transcribe-audio",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
@local_chat_router.post(
    "/transcribe-voice",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def local_transcribe_chat_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(verify_local_worker_access),
) -> BaseResponse[AudioTranscriptionResponse]:
    return await transcribe_chat_audio(conversation_id, audio, profile)


@local_chat_router.post(
    "/transcribe-practice",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def local_transcribe_practice_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(verify_local_worker_access),
) -> BaseResponse[AudioTranscriptionResponse]:
    return await transcribe_practice_audio(conversation_id, audio, profile)


@local_chat_router.post(
    "/send-voice-message",
    response_model=BaseResponse[MessageResponse],
)
async def local_send_voice_message(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(verify_local_worker_access),
) -> BaseResponse[MessageResponse]:
    return await send_voice_message(conversation_id, audio, profile)


@local_chat_router.post(
    "/reading-answer",
    response_model=BaseResponse[ReadingPracticeTurnResponse],
)
@local_chat_router.post(
    "/pronunciation-turn",
    response_model=BaseResponse[ReadingPracticeTurnResponse],
)
async def local_submit_reading_practice_answer(
    conversation_id: UUID = Form(...),
    turn_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(verify_local_worker_access),
) -> BaseResponse[ReadingPracticeTurnResponse]:
    return await submit_reading_practice_answer(conversation_id, turn_id, audio, profile)


app.include_router(
    local_chat_router,
    prefix=f"{settings.API_V1_STR}/chat-ai",
)

# Register CORSMiddleware LAST so CORS headers are always attached
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


if __name__ == "__main__":
    uvicorn.run("local_worker:app", host="0.0.0.0", port=8001, reload=False)
