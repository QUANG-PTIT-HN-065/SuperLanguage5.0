import logging
import time
from typing import Any, Dict, Optional, Tuple
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from supabase import create_client, Client

from app.core.deps import get_optional_current_profile
from app.core.config import settings
from app.schemas.chat_ai import (
    ConversationCreate,
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
_guest_conversations: Dict[str, Tuple[str, float]] = {}
_guest_message_requests: Dict[str, list[float]] = {}
_GUEST_SESSION_TTL_SECONDS = 30 * 60
_MAX_GUEST_CONVERSATIONS = 500
_GUEST_MESSAGE_LIMIT = 15
_GUEST_MESSAGE_WINDOW_SECONDS = 60


def _create_guest_conversation(language_code: str) -> UUID:
    now = time.monotonic()
    expired = [
        conversation_id
        for conversation_id, (_, created_at) in _guest_conversations.items()
        if now - created_at >= _GUEST_SESSION_TTL_SECONDS
    ]
    for conversation_id in expired:
        _guest_conversations.pop(conversation_id, None)

    if len(_guest_conversations) >= _MAX_GUEST_CONVERSATIONS:
        oldest = min(_guest_conversations, key=lambda key: _guest_conversations[key][1])
        _guest_conversations.pop(oldest)

    conversation_id = uuid4()
    _guest_conversations[str(conversation_id)] = (language_code, now)
    return conversation_id


def _check_guest_message_limit(client_host: Optional[str]) -> None:
    now = time.monotonic()
    host = client_host or "unknown"
    recent_requests = [
        requested_at
        for requested_at in _guest_message_requests.get(host, [])
        if now - requested_at < _GUEST_MESSAGE_WINDOW_SECONDS
    ]
    if len(recent_requests) >= _GUEST_MESSAGE_LIMIT:
        _guest_message_requests[host] = recent_requests
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Bạn đã gửi nhiều tin nhắn trong thời gian ngắn. Vui lòng đợi một phút rồi thử lại.",
        )
    recent_requests.append(now)
    _guest_message_requests[host] = recent_requests


@router.post("/conversations")
def create_conversation(
    data: ConversationCreate,
    profile: Optional[Dict[str, Any]] = Depends(get_optional_current_profile),
) -> BaseResponse[ConversationResponse]:
    """Tạo phòng luyện nói cho học viên hoặc một phiên khách."""
    if profile is None:
        conversation_id = _create_guest_conversation(data.language_code)
        return BaseResponse(
            status="success",
            message="Đã tạo phòng trò chuyện dùng thử.",
            data=ConversationResponse(
                id=conversation_id,
                title=data.title,
                language_code=data.language_code,
            ),
        )

    try:
        res = (
            supabase.table("conversations")
            .insert({
                "user_id": profile["id"] if profile else None,
                "title": data.title,
                "language_code": data.language_code,
            })
            .select("id,title,language_code,created_at")
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
        ),
    )


@router.post("/send-message", response_model=BaseResponse[MessageResponse])
async def send_message(
    data: MessageSend,
    request: Request,
    profile: Optional[Dict[str, Any]] = Depends(get_optional_current_profile),
) -> BaseResponse[MessageResponse]:
    """Gửi tin nhắn, gọi AIService và lưu trữ lịch sử qua Supabase"""
    if profile is None:
        _check_guest_message_limit(request.client.host if request.client else None)
        guest_conversation = _guest_conversations.get(str(data.conversation_id))
        if (
            guest_conversation is None
            or time.monotonic() - guest_conversation[1] >= _GUEST_SESSION_TTL_SECONDS
        ):
            _guest_conversations.pop(str(data.conversation_id), None)
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Phiên dùng thử đã hết hạn. Hãy tạo một cuộc trò chuyện mới.",
            )
        lang = guest_conversation[0]
    else:
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

    if profile is not None:
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