"""
Local AI Worker (Windows 11) for SuperLanguage 5.0.
Runs on port 8001 behind Cloudflare Tunnel (https://ai-local.superlanguage.me)
to offload heavy local Whisper / audio processing from Render Free Tier (512 MB RAM).

Usage:
    uvicorn local_worker:app --host 0.0.0.0 --port 8001
"""

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from typing import Any, Dict
from uuid import UUID

import httpx
import uvicorn
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

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
) -> Dict[str, Any]:
    """Authenticate user-facing worker operations with the Supabase JWT."""
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


@app.post("/internal/v1/chat/completions")
async def local_llm_chat_completions(
    payload: Dict[str, Any] = Body(...),
    x_local_secret_key: str | None = Header(default=None, alias="X-Local-Secret-Key"),
) -> Response:
    expected_secret = (settings.LOCAL_WORKER_SECRET or "").strip()
    if not expected_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Local AI worker authentication is not configured.",
        )
    if not x_local_secret_key or not hmac.compare_digest(x_local_secret_key, expected_secret):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid local worker credentials.")
    if not isinstance(payload.get("messages"), list) or not payload["messages"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Chat messages are required.")

    ollama_payload = dict(payload)
    ollama_payload["model"] = settings.LOCAL_LLM_MODEL
    ollama_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/v1/chat/completions"
    timeout = httpx.Timeout(settings.LOCAL_LLM_TIMEOUT_SECONDS, connect=5.0)
    client = httpx.AsyncClient(timeout=timeout)
    request = client.build_request("POST", ollama_url, json=ollama_payload)

    try:
        upstream = await client.send(request, stream=True)
    except httpx.TimeoutException as exc:
        await client.aclose()
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "Local Ollama request timed out.",
        ) from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Local Ollama is unavailable.",
        ) from exc

    if not upstream.is_success:
        content = await upstream.aread()
        media_type = upstream.headers.get("content-type", "application/json")
        status_code = upstream.status_code
        await upstream.aclose()
        await client.aclose()
        return Response(content=content, status_code=status_code, media_type=media_type)

    if not ollama_payload.get("stream"):
        content = await upstream.aread()
        media_type = upstream.headers.get("content-type", "application/json")
        status_code = upstream.status_code
        await upstream.aclose()
        await client.aclose()
        return Response(content=content, status_code=status_code, media_type=media_type)

    async def stream_response():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_response(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "text/event-stream"),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    uvicorn.run("local_worker:app", host="0.0.0.0", port=8001, reload=False)
