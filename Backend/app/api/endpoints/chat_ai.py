import logging
from pathlib import PurePath
from typing import Any, Dict
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from supabase import create_client, Client

from app.core.deps import get_current_profile
from app.core.config import settings
from app.schemas.chat_ai import (
    AudioUploadResponse,
    ConversationCreate,
    ConversationMessageResponse,
    ConversationResponse,
    MessageSend,
    MessageResponse,
)
from app.schemas.reponse import BaseResponse
from app.services.ai_service import AIService

router = APIRouter(tags=["AI Chat Speaking"])
logger = logging.getLogger(__name__)


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
) -> None:
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
    lang = conv.data[0]["language_code"]

    try:
        ai_reply, ai_feedback = await AIService.generate_chat_response(data.user_message, lang)
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