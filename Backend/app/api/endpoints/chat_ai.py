import logging
from pathlib import PurePath
from typing import Any, Dict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from supabase import create_client, Client
from starlette.concurrency import run_in_threadpool

from app.core.deps import get_current_profile
from app.core.config import settings
from app.schemas.chat_ai import (
    AudioTranscriptionResponse,
    AudioUploadResponse,
    ConversationCreate,
    ConversationMessageResponse,
    ConversationResponse,
    MessageSend,
    MessageResponse,
)
from app.schemas.reponse import BaseResponse
from app.services.ai_service import AIService
from app.services.speech_service import (
    InvalidAudioError,
    SpeechNotRecognizedError,
    SpeechServiceUnavailableError,
    transcribe_audio,
)

router = APIRouter(tags=["AI Chat Speaking"])
logger = logging.getLogger(__name__)
_CHAT_CONTEXT_MESSAGE_LIMIT = 10
_CHAT_LANGUAGE_NAMES = {
    "en": "English",
    "English": "English",
    "ja": "Japanese",
    "Japanese": "Japanese",
}


# Khởi tạo Supabase client từ cấu hình chung trong config.py
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
_MAX_AUDIO_BYTES = 10 * 1024 * 1024
_AUDIO_BUCKET = "chat-audio"
_AUDIO_EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/aac": ".aac",
}


def _verify_audio_conversation(
    conversation_id: UUID,
    profile: Dict[str, Any],
) -> str:
    try:
        conversation = (
            supabase.table("conversations")
            .select("language_code")
            .eq("id", str(conversation_id))
            .eq("user_id", profile["id"])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not verify the audio conversation.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải phòng trò chuyện lúc này. Vui lòng thử lại.",
        ) from exc

    if not conversation.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phòng trò chuyện.")
    return conversation.data[0]["language_code"]


@router.get("/conversations", response_model=BaseResponse[list[ConversationResponse]])
def list_conversations(
    limit: int = Query(default=100, ge=1, le=1000),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[list[ConversationResponse]]:
    """Lấy các hội thoại gần đây của tài khoản hiện tại."""
    try:
        result = (
            supabase.table("conversations")
            .select("id,title,language_code,created_at,updated_at")
            .eq("user_id", profile["id"])
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load AI chat conversation history.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải lịch sử hội thoại lúc này. Vui lòng thử lại.",
        ) from exc

    conversations = [
        ConversationResponse(
            id=row["id"],
            title=row["title"],
            language_code=row["language_code"],
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )
        for row in (result.data or [])
    ]
    return BaseResponse(
        status="success",
        message="Đã tải lịch sử hội thoại.",
        data=conversations,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=BaseResponse[list[ConversationMessageResponse]],
)
def list_conversation_messages(
    conversation_id: UUID,
    limit: int = Query(default=1000, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[list[ConversationMessageResponse]]:
    """Lấy tin nhắn sau khi xác nhận hội thoại thuộc tài khoản hiện tại."""
    try:
        conversation = (
            supabase.table("conversations")
            .select("id")
            .eq("id", str(conversation_id))
            .eq("user_id", profile["id"])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not verify AI chat conversation ownership.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải phòng trò chuyện lúc này. Vui lòng thử lại.",
        ) from exc

    if not conversation.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phòng trò chuyện.")

    try:
        result = (
            supabase.table("messages")
            .select("id,conversation_id,sender_type,content,ai_feedback,created_at")
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=False)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load AI chat conversation messages.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải tin nhắn lúc này. Vui lòng thử lại.",
        ) from exc

    messages = [
        ConversationMessageResponse(
            id=row["id"],
            conversation_id=row["conversation_id"],
            sender_type=row["sender_type"],
            content=row["content"],
            ai_feedback=row.get("ai_feedback"),
            created_at=row.get("created_at"),
        )
        for row in (result.data or [])
    ]
    return BaseResponse(
        status="success",
        message="Đã tải tin nhắn hội thoại.",
        data=messages,
    )


@router.post("/conversations")
def create_conversation(
    data: ConversationCreate,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[ConversationResponse]:
    """Tạo phòng luyện nói cho học viên đã xác thực."""
    # Bộ ánh xạ chuyển đổi tên ngôn ngữ từ Frontend sang mã code chuẩn trong Database
    lang_mapping = {
        "Tiếng Anh": "en",
        "English": "en",
        "Tiếng Nhật": "ja",
        "Japanese": "ja",
        "Tiếng Việt": "vi",
        "Vietnamese": "vi",
        "Tiếng Hàn": "ko",
        "Korean": "ko",
        "Tiếng Trung": "zh",
        "Chinese": "zh"
    }

    # Lấy mã code chuẩn, nếu đã là mã code (ví dụ 'en') thì giữ nguyên
    target_lang_code = lang_mapping.get(data.language_code, data.language_code)
    try:
        res = (
            supabase.table("conversations")
            .insert({
                "user_id": profile["id"],
                "title": data.title,
                "language_code": target_lang_code,
            })
            .select("id,title,language_code,created_at,updated_at")
            .single()
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not create an AI chat conversation.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tạo phòng trò chuyện lúc này. Vui lòng thử lại.",
        ) from exc

    conversation = res.data
    if not conversation:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu không trả về thông tin phòng trò chuyện.",
        )

    return BaseResponse(
        status="success",
        message="Đã tạo phòng trò chuyện.",
        data=ConversationResponse(
            id=conversation["id"],
            title=conversation["title"],
            language_code=conversation["language_code"],
            created_at=conversation.get("created_at"),
            updated_at=conversation.get("updated_at"),
        ),
    )


@router.post("/upload-audio", response_model=BaseResponse[AudioUploadResponse])
async def upload_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[AudioUploadResponse]:
    """Nhận file ghi âm, lưu vào kho riêng tư và gắn với hội thoại."""
    _verify_audio_conversation(conversation_id, profile)

    content_type = (audio.content_type or "").split(";", maxsplit=1)[0].strip().lower()
    extension = _AUDIO_EXTENSIONS.get(content_type)
    if extension is None:
        await audio.close()
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Định dạng âm thanh không được hỗ trợ.",
        )

    audio_bytes = await audio.read(_MAX_AUDIO_BYTES + 1)
    if not audio_bytes:
        await audio.close()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File ghi âm đang trống.")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        await audio.close()
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File ghi âm vượt quá giới hạn 10 MB.",
        )

    original_name = PurePath(audio.filename or "voice-recording").name
    object_path = f"{conversation_id}/{uuid4()}{extension}"
    storage_uploaded = False
    try:
        supabase.storage.from_(_AUDIO_BUCKET).upload(
            object_path,
            audio_bytes,
            {"content-type": content_type, "upsert": "false"},
        )
        storage_uploaded = True
        supabase.table("messages").insert({
            "conversation_id": str(conversation_id),
            "sender_type": "user",
            "content": "Bản ghi âm",
            "audio_url": object_path,
        }).execute()
    except Exception as exc:
        if storage_uploaded:
            try:
                supabase.storage.from_(_AUDIO_BUCKET).remove([object_path])
            except Exception:
                logger.exception("Could not clean up an unlinked chat audio file.")
        logger.exception("Could not store uploaded chat audio.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu file ghi âm. Hãy kiểm tra cấu hình kho chat-audio rồi thử lại.",
        ) from exc
    finally:
        await audio.close()

    response = BaseResponse(
        status="success",
        message="Đã tải bản ghi âm lên máy chủ.",
        data=AudioUploadResponse(
            conversation_id=conversation_id,
            file_name=original_name,
            content_type=content_type,
            size_bytes=len(audio_bytes),
            storage_path=object_path,
        ),
    )
    return response


@router.post(
    "/transcribe-audio",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def transcribe_chat_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[AudioTranscriptionResponse]:
    """Transcribe a temporary audio recording and automatically detect its language."""
    try:
        _verify_audio_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise
    content_type = (audio.content_type or "").split(";", maxsplit=1)[0].strip().lower()
    if content_type not in _AUDIO_EXTENSIONS:
        await audio.close()
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Định dạng âm thanh không được hỗ trợ.",
        )

    try:
        audio_bytes = await audio.read(_MAX_AUDIO_BYTES + 1)
    finally:
        await audio.close()

    if not audio_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File ghi âm đang trống.")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File ghi âm vượt quá giới hạn 10 MB.",
        )

    try:
        transcript = await run_in_threadpool(
            transcribe_audio,
            audio_bytes,
        )
    except InvalidAudioError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không thể đọc file ghi âm. Hãy ghi âm lại rồi thử tiếp.",
        ) from exc
    except SpeechNotRecognizedError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Chưa nhận diện rõ lời nói. Hãy nói gần micro và thử lại.",
        ) from exc
    except SpeechServiceUnavailableError as exc:
        logger.warning("Whisper speech recognition service is unavailable.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Dịch vụ nhận diện giọng nói đang bận. Vui lòng thử lại sau.",
        ) from exc

    return BaseResponse(
        status="success",
        message="Đã chuyển giọng nói thành văn bản.",
        data=AudioTranscriptionResponse(transcript=transcript),
    )


@router.post("/send-message", response_model=BaseResponse[MessageResponse])
async def send_message(
    data: MessageSend,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[MessageResponse]:
    """Gửi tin nhắn, gọi AIService và lưu trữ lịch sử qua Supabase"""
    try:
        conv = (
            supabase.table("conversations")
            .select("language_code")
            .eq("id", str(data.conversation_id))
            .eq("user_id", profile["id"])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load AI chat conversation.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải phòng trò chuyện lúc này. Vui lòng thử lại.",
        ) from exc

    if not conv.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phòng trò chuyện.")
    language_code = conv.data[0].get("language_code")
    if not isinstance(language_code, str) or language_code not in _CHAT_LANGUAGE_NAMES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Hội thoại này dùng ngôn ngữ không còn được hỗ trợ.",
        )

    try:
        previous_messages = (
            supabase.table("messages")
            .select("sender_type,content")
            .eq("conversation_id", str(data.conversation_id))
            .order("created_at", desc=True)
            .limit(_CHAT_CONTEXT_MESSAGE_LIMIT)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load previous AI chat messages.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải ngữ cảnh hội thoại lúc này. Vui lòng thử lại.",
        ) from exc

    conversation_history = [
        {
            "role": "assistant" if row.get("sender_type") == "ai" else "user",
            "content": row["content"],
        }
        for row in reversed(previous_messages.data or [])
        if row.get("sender_type") in {"user", "ai"}
        and isinstance(row.get("content"), str)
        and row["content"].strip()
    ]

    try:
        ai_reply, ai_feedback = await AIService.generate_chat_response(
            data.user_message,
            _CHAT_LANGUAGE_NAMES[language_code],
            profile.get("current_level") or "A1",
            conversation_history=conversation_history,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        logger.exception("AI chat response generation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể phản hồi lúc này. Tin nhắn của bạn chưa được lưu, vui lòng thử lại.",
        ) from exc
    except Exception as exc:
        logger.exception("AI chat response generation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể phản hồi lúc này. Tin nhắn của bạn chưa được lưu, vui lòng thử lại.",
        ) from exc

    try:
        supabase.table("messages").insert([
            {
                "conversation_id": str(data.conversation_id),
                "sender_type": "user",
                "content": data.user_message,
            },
            {
                "conversation_id": str(data.conversation_id),
                "sender_type": "ai",
                "content": ai_reply,
                "ai_feedback": ai_feedback,
            },
        ]).execute()
    except Exception as exc:
        logger.exception("Could not persist AI chat messages.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu tin nhắn lúc này. Vui lòng thử lại.",
        ) from exc

    return BaseResponse(
        status="success",
        message="Đã nhận phản hồi từ AI.",
        data=MessageResponse(
            conversation_id=data.conversation_id,
            user_message=data.user_message,
            ai_response=ai_reply,
            ai_feedback=ai_feedback,
        ),
    )