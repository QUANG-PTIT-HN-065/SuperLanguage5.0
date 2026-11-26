import asyncio
import json
import logging
from pathlib import PurePath
from typing import Annotated, Any, Dict, Optional
from uuid import UUID, uuid4

import edge_tts
import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError
from supabase import create_client, Client
from starlette.concurrency import run_in_threadpool

from app.core.deps import get_current_profile
from app.core.config import settings
from app.core.ai_quota import consume_daily_ai_call, read_daily_ai_usage
from app.schemas.chat_ai import (
    AudioTranscriptionResponse,
    AudioUploadResponse,
    ConversationCreate,
    ConversationMessageResponse,
    ConversationResponse,
    MessageSend,
    MessageResponse,
    PronunciationTurnFeedback,
    PronunciationTurnResponse,
    ReadingFeedback,
    ReadingPracticeTurnResponse,
    ReadingPromptContent,
    ReadingPromptRequest,
    ReadingPromptResponse,
    TTSRequest,
)
from app.schemas.reponse import BaseResponse
from app.services.ai_service import AIService
from app.services.speech_service import (
    InvalidAudioError,
    SpeechNotRecognizedError,
    SpeechServiceUnavailableError,
    convert_audio_to_wav,
    transcribe_audio,
    transcribe_audio_cloud,
)

router = APIRouter(tags=["AI Chat Speaking"])
logger = logging.getLogger(__name__)
_CHAT_CONTEXT_MESSAGE_LIMIT = 10
_CHAT_LANGUAGE_NAMES = {
    "en": "English",
    "English": "English",
    "ja": "Japanese",
    "Japanese": "Japanese",
    "vi": "Vietnamese",
    "Vietnamese": "Vietnamese",
}
_CHAT_ASR_LANGUAGE_CODES = {
    "en": "en",
    "English": "en",
    "ja": "ja",
    "Japanese": "ja",
    "vi": "vi",
    "Vietnamese": "vi",
}
_CHAT_TTS_VOICES = {
    "English": "en-GB-RyanNeural",
    "Japanese": "ja-JP-KeitaNeural",
    "Vietnamese": "vi-VN-NamMinhNeural",
}
_CHAT_TTS_LANGUAGE_CODES = {"English": "en", "Japanese": "ja", "Vietnamese": "vi"}
# Giọng mặc định từ thư viện công khai ADSUP (voice.adsup.vn/demo/voices)
_ADSUP_DEFAULT_VOICES = {
    "vi": "e79a7e29-37e7-43bb-95ce-a5526876c6f6",  # Adam
    "en": "b062b5dd-2536-4162-9433-16f42e06aa7d",  # Freddy Fazbear
    "ja": "b7e9c5e7-15d7-46d0-b853-5044e9c0c224",  # Kuon - 明るく明瞭で安定した声
}
_ADSUP_VOICE_FIELDS = ("id", "name", "language", "gender", "category_name", "has_preview")
# Hết hạn mức / key bị từ chối / rate-limit → thử key kế tiếp trong pool
_ADSUP_KEY_ERROR_CODES = {401, 402, 403, 429}


def _adsup_keys() -> list[str]:
    return [key.strip() for key in (settings.ADSUP_API_KEYS or "").split(",") if key.strip()]


def _adsup_client() -> httpx.AsyncClient:
    # Cloudflare chặn TLS fingerprint Python (UA curl để vượt); trust_env=False
    # vì NO_PROXY chứa "::1" khiến httpx ném InvalidURL khi parse proxy.
    return httpx.AsyncClient(
        trust_env=False,
        timeout=60.0,
        headers={"User-Agent": "curl/8.7.1"},
    )


def _is_missing_conversation_column(exc: Exception, column: str) -> bool:
    payload = exc.args[0] if exc.args else None
    error_code = getattr(exc, "code", None)
    if isinstance(payload, dict):
        error_code = payload.get("code", error_code)
        message = str(payload.get("message", exc)).lower()
    else:
        message = str(exc).lower()

    column_reference = f"conversations.{column}"
    schema_cache_reference = f"'{column}'"
    return str(error_code) in {"42703", "PGRST204"} and (
        column_reference in message or schema_cache_reference in message
    )


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


def _load_reading_conversation(
    conversation_id: UUID,
    profile: Dict[str, Any],
) -> Dict[str, Any]:
    try:
        conversation = (
            supabase.table("conversations")
            .select("id,title,language_code,practice_mode")
            .eq("id", str(conversation_id))
            .eq("user_id", profile["id"])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if _is_missing_conversation_column(exc, "practice_mode"):
            logger.warning(
                "The conversations.practice_mode column is missing; "
                "read-aloud sessions require migration 11.",
            )
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Cơ sở dữ liệu chưa sẵn sàng cho chế độ đọc theo mẫu. "
                "Hãy chạy migration 11 rồi thử lại.",
            ) from exc
        logger.exception("Could not load the AI reading-practice conversation.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải phòng luyện tập lúc này. Vui lòng thử lại.",
        ) from exc

    if not conversation.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phòng luyện tập.")

    row = conversation.data[0]
    if row.get("practice_mode") != "read-aloud":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Phòng luyện tập này không ở chế độ đọc theo mẫu.",
        )
    return row


def _decode_ai_json_object(raw_text: str, response_label: str) -> Dict[str, Any]:
    normalized = raw_text.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        normalized = "\n".join(lines).strip()

    try:
        result = json.loads(normalized)
    except json.JSONDecodeError as exc:
        logger.warning("AI returned invalid JSON for %s.", response_label)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa trả về dữ liệu đúng định dạng. Vui lòng thử lại.",
        ) from exc

    if not isinstance(result, dict):
        logger.warning("AI returned a non-object JSON value for %s.", response_label)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa trả về dữ liệu đúng định dạng. Vui lòng thử lại.",
        )
    return result


def _normalized_reading_question(question: str) -> str:
    return "".join(character for character in question.casefold() if character.isalnum())


def _reading_turn_response(row: Dict[str, Any]) -> ReadingPracticeTurnResponse:
    feedback_data = row.get("ai_feedback")
    feedback = ReadingFeedback.model_validate(feedback_data) if feedback_data else None
    return ReadingPracticeTurnResponse(
        id=row["id"],
        conversation_id=row["conversation_id"],
        question=row["question"],
        sample_answer=row["sample_answer"],
        transcript=row.get("transcript"),
        ai_feedback=feedback,
        created_at=row.get("created_at"),
    )


async def _read_audio_upload(audio: UploadFile) -> bytes:
    try:
        content_type = (audio.content_type or "").split(";", maxsplit=1)[0].strip().lower()
        if content_type not in _AUDIO_EXTENSIONS:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                "Định dạng âm thanh không được hỗ trợ.",
            )
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
    return audio_bytes


async def _transcribe_for_profile(
    audio_bytes: bytes,
    profile: Dict[str, Any],
    language: Optional[str],
    charge_quota: bool = True,
    filename: str = "voice.webm",
    content_type: str = "audio/webm",
) -> str:
    """language=None = Whisper tự nhận diện ngôn ngữ đang nói (chép nguyên văn)."""
    if charge_quota:
        consume_daily_ai_call(profile)
    try:
        if settings.USE_LOCAL_WHISPER:
            return await run_in_threadpool(transcribe_audio, audio_bytes, language)
        return await transcribe_audio_cloud(
            audio_bytes,
            language,
            filename=filename,
            content_type=content_type,
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
        logger.warning("Speech recognition service is unavailable.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Dịch vụ nhận diện giọng nói đang bận. Vui lòng thử lại sau.",
        ) from exc


async def _prepare_pronunciation_audio(
    audio_bytes: bytes,
    content_type: str = "audio/webm",
) -> tuple[bytes, str]:
    if not settings.USE_LOCAL_WHISPER:
        return audio_bytes, (content_type or "audio/webm").split(";", maxsplit=1)[0].strip().lower()
    try:
        wav_bytes = await run_in_threadpool(convert_audio_to_wav, audio_bytes)
        return wav_bytes, "audio/wav"
    except InvalidAudioError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không thể đọc file ghi âm. Hãy ghi âm lại rồi thử tiếp.",
        ) from exc
    except SpeechServiceUnavailableError as exc:
        logger.warning("Audio preparation for pronunciation assessment is unavailable.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể chuẩn bị âm thanh để chấm phát âm. Vui lòng thử lại sau.",
        ) from exc


@router.get("/quota", response_model=BaseResponse[Dict[str, Any]])
def get_ai_quota(
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[Dict[str, Any]]:
    """Hạn mức lượt AI hôm nay của tài khoản (chỉ đọc, không trừ lượt)."""
    return BaseResponse(
        status="success",
        message="Đã tải hạn mức AI hôm nay.",
        data=read_daily_ai_usage(profile),
    )


@router.get("/conversations", response_model=BaseResponse[list[ConversationResponse]])
def list_conversations(
    limit: int = Query(default=100, ge=1, le=1000),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[list[ConversationResponse]]:
    """Lấy các hội thoại gần đây của tài khoản hiện tại."""
    legacy_schema = False
    try:
        result = (
            supabase.table("conversations")
            .select("id,title,language_code,practice_mode,created_at,updated_at")
            .eq("user_id", profile["id"])
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        if _is_missing_conversation_column(exc, "practice_mode"):
            legacy_schema = True
            logger.warning(
                "The conversations.practice_mode column is missing; "
                "loading legacy conversations as free-chat. Apply migration 11.",
            )
            try:
                result = (
                    supabase.table("conversations")
                    .select("id,title,language_code,created_at,updated_at")
                    .eq("user_id", profile["id"])
                    .order("updated_at", desc=True)
                    .limit(limit)
                    .execute()
                )
            except Exception as fallback_exc:
                logger.exception("Could not load legacy AI chat conversation history.")
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Không thể tải lịch sử hội thoại lúc này. Vui lòng thử lại.",
                ) from fallback_exc
        else:
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
            practice_mode=row.get("practice_mode") or "free-chat",
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )
        for row in (result.data or [])
    ]
    return BaseResponse(
        status="success",
        message=(
            "Đã tải lịch sử hội thoại. Áp dụng migration 11 để bật chế độ đọc theo mẫu."
            if legacy_schema
            else "Đã tải lịch sử hội thoại."
        ),
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
    legacy_schema = False
    try:
        res = (
            supabase.table("conversations")
            .insert({
                "user_id": profile["id"],
                "title": data.title,
                "language_code": target_lang_code,
                "practice_mode": data.practice_mode,
            })
            .select("id,title,language_code,practice_mode,created_at,updated_at")
            .single()
            .execute()
        )
    except Exception as exc:
        if _is_missing_conversation_column(exc, "practice_mode"):
            if data.practice_mode != "free-chat":
                logger.warning(
                    "Read-aloud sessions require the conversations.practice_mode column. "
                    "Apply migration 11.",
                )
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Cơ sở dữ liệu chưa sẵn sàng cho chế độ đọc theo mẫu. "
                    "Hãy chạy migration 11 rồi thử lại.",
                ) from exc

            legacy_schema = True
            logger.warning(
                "The conversations.practice_mode column is missing; "
                "creating a legacy free-chat conversation. Apply migration 11.",
            )
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
            except Exception as fallback_exc:
                logger.exception("Could not create a legacy AI chat conversation.")
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "Không thể tạo phòng trò chuyện lúc này. Vui lòng thử lại.",
                ) from fallback_exc
        else:
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
        message=(
            "Đã tạo phòng trò chuyện. Áp dụng migration 11 để bật chế độ đọc theo mẫu."
            if legacy_schema
            else "Đã tạo phòng trò chuyện."
        ),
        data=ConversationResponse(
            id=conversation["id"],
            title=conversation["title"],
            language_code=conversation["language_code"],
            practice_mode=conversation.get("practice_mode") or "free-chat",
            created_at=conversation.get("created_at"),
            updated_at=conversation.get("updated_at"),
        ),
    )


@router.post(
    "/reading-prompt",
    response_model=BaseResponse[ReadingPromptResponse],
)
async def generate_reading_prompt(
    data: ReadingPromptRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[ReadingPromptResponse]:
    row = _load_reading_conversation(data.conversation_id, profile)
    language_code = row.get("language_code")
    language = _CHAT_LANGUAGE_NAMES.get(language_code)
    topic = row.get("title")
    if language is None or not isinstance(topic, str) or not topic.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Chủ đề hoặc ngôn ngữ của phòng trò chuyện không hợp lệ.",
        )

    try:
        recent_turns_result = (
            supabase.table("reading_practice_turns")
            .select("id,question,sample_answer,transcript,ai_feedback,created_at")
            .eq("conversation_id", str(data.conversation_id))
            .order("created_at", desc=True)
            .limit(8)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load previous reading-practice turns.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải các câu luyện tập trước đó. Vui lòng thử lại.",
        ) from exc

    recent_turns = recent_turns_result.data or []
    pending_turn = next(
        (
            turn for turn in recent_turns
            if not turn.get("transcript") and not turn.get("ai_feedback")
        ),
        None,
    )
    pending_turn_is_repeat = bool(
        pending_turn
        and any(
            turn["id"] != pending_turn["id"]
            and _normalized_reading_question(turn["question"])
            == _normalized_reading_question(pending_turn["question"])
            for turn in recent_turns
        )
    )
    if pending_turn and not pending_turn_is_repeat:
        return BaseResponse(
            status="success",
            message="Đã có câu hỏi đang chờ trả lời.",
            data=ReadingPromptResponse(
                id=pending_turn["id"],
                conversation_id=str(data.conversation_id),
                question=pending_turn["question"],
                sample_answer=pending_turn["sample_answer"],
                created_at=pending_turn.get("created_at"),
            ),
        )

    reading_history = [
        {
            "question": turn["question"],
            "sample_answer": turn["sample_answer"],
            "learner_answer": turn.get("transcript") or "",
        }
        for turn in reversed(recent_turns)
        if not pending_turn or turn["id"] != pending_turn["id"]
    ]

    if not pending_turn:
        consume_daily_ai_call(profile)
    try:
        prompt_json, _ = await AIService.generate_chat_response(
            "Create one short question and one sample answer for the learner.",
            language,
            profile.get("current_level") or "A1",
            reading_topic=topic,
            reading_history=reading_history,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("AI reading-practice prompt generation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể tạo câu đọc lúc này. Vui lòng thử lại.",
        ) from exc

    try:
        prompt = ReadingPromptContent.model_validate(
            _decode_ai_json_object(prompt_json, "reading prompt"),
        )
    except ValidationError as exc:
        logger.warning("AI returned invalid reading-prompt fields.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa trả về được câu hỏi và câu trả lời mẫu hợp lệ. Vui lòng thử lại.",
        ) from exc

    if any(
        _normalized_reading_question(turn["question"])
        == _normalized_reading_question(prompt.question)
        for turn in reading_history
    ):
        logger.warning("AI repeated a question from the reading-practice history.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI vừa lặp lại câu hỏi trước đó. Vui lòng thử tạo câu tiếp theo.",
        )

    try:
        turn_query = supabase.table("reading_practice_turns")
        if pending_turn:
            saved = (
                turn_query.update({
                    "question": prompt.question,
                    "sample_answer": prompt.sample_answer,
                })
                .eq("id", pending_turn["id"])
                .eq("conversation_id", str(data.conversation_id))
                .select("id,conversation_id,question,sample_answer,created_at")
                .single()
                .execute()
            )
        else:
            saved = (
                turn_query.insert({
                    "conversation_id": str(data.conversation_id),
                    "question": prompt.question,
                    "sample_answer": prompt.sample_answer,
                })
                .select("id,conversation_id,question,sample_answer,created_at")
                .single()
                .execute()
            )
    except Exception as exc:
        logger.exception("Could not save an AI reading-practice prompt.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu câu luyện tập. Vui lòng thử lại.",
        ) from exc

    if not saved.data:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu không trả về thông tin câu luyện tập.",
        )

    return BaseResponse(
        status="success",
        message="Đã tạo và lưu câu hỏi cùng câu trả lời mẫu.",
        data=ReadingPromptResponse(
            id=saved.data["id"],
            conversation_id=saved.data["conversation_id"],
            question=saved.data["question"],
            sample_answer=saved.data["sample_answer"],
            created_at=saved.data.get("created_at"),
        ),
    )


@router.get(
    "/conversations/{conversation_id}/reading-turns",
    response_model=BaseResponse[list[ReadingPracticeTurnResponse]],
)
def list_reading_practice_turns(
    conversation_id: UUID,
    limit: int = Query(default=1000, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[list[ReadingPracticeTurnResponse]]:
    _load_reading_conversation(conversation_id, profile)
    try:
        result = (
            supabase.table("reading_practice_turns")
            .select(
                "id,conversation_id,question,sample_answer,transcript,ai_feedback,created_at",
            )
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=False)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load saved reading-practice turns.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải lịch sử đọc theo mẫu lúc này. Vui lòng thử lại.",
        ) from exc

    return BaseResponse(
        status="success",
        message="Đã tải lịch sử đọc theo mẫu.",
        data=[_reading_turn_response(row) for row in (result.data or [])],
    )


@router.post(
    "/reading-answer",
    response_model=BaseResponse[ReadingPracticeTurnResponse],
)
@router.post(
    "/pronunciation-turn",
    response_model=BaseResponse[ReadingPracticeTurnResponse],
)
async def submit_reading_practice_answer(
    conversation_id: UUID = Form(...),
    turn_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[ReadingPracticeTurnResponse]:
    try:
        conversation = _load_reading_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise

    language_code = conversation.get("language_code")
    language = _CHAT_ASR_LANGUAGE_CODES.get(language_code)
    if language is None:
        await audio.close()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Ngôn ngữ của phòng luyện tập không được hỗ trợ nhận diện.",
        )

    try:
        turn_result = (
            supabase.table("reading_practice_turns")
            .select("id,conversation_id,question,sample_answer,transcript,ai_feedback,created_at")
            .eq("id", str(turn_id))
            .eq("conversation_id", str(conversation_id))
            .limit(1)
            .execute()
        )
    except Exception as exc:
        await audio.close()
        logger.exception("Could not load the reading-practice turn.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải câu luyện tập lúc này. Vui lòng thử lại.",
        ) from exc

    if not turn_result.data:
        await audio.close()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy câu luyện tập.")

    turn = turn_result.data[0]
    if turn.get("transcript") and turn.get("ai_feedback"):
        await audio.close()
        return BaseResponse(
            status="success",
            message="Câu trả lời này đã được chấm trước đó.",
            data=_reading_turn_response(turn),
        )

    upload_content_type = (audio.content_type or "audio/webm").split(";", maxsplit=1)[0].strip().lower()
    upload_filename = audio.filename or "voice.webm"
    audio_bytes = await _read_audio_upload(audio)
    pronunciation_audio, pronunciation_mime = await _prepare_pronunciation_audio(
        audio_bytes,
        upload_content_type,
    )
    transcript = (
        await _transcribe_for_profile(
            pronunciation_audio,
            profile,
            language,
            charge_quota=False,
            filename=upload_filename if pronunciation_mime != "audio/wav" else "voice.wav",
            content_type=pronunciation_mime,
        )
    ).strip()
    if not transcript or len(transcript) > 4000:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Không nhận diện được câu trả lời hợp lệ. Hãy thử ghi âm lại.",
        )

    try:
        feedback_text = await AIService.evaluate_reading_practice_audio(
            pronunciation_audio,
            transcript,
            turn["question"],
            turn["sample_answer"],
            _CHAT_LANGUAGE_NAMES[language_code],
            profile.get("current_level") or "A1",
            # pyrefly: ignore[unexpected-keyword]
            mime_type=pronunciation_mime,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        logger.exception("AI reading-practice evaluation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể đánh giá câu trả lời lúc này. Vui lòng thử lại.",
        ) from exc
    except Exception as exc:
        logger.exception("AI reading-practice evaluation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể đánh giá câu trả lời lúc này. Vui lòng thử lại.",
        ) from exc

    try:
        feedback = ReadingFeedback.model_validate(
            _decode_ai_json_object(feedback_text, "reading feedback"),
        )
    except ValidationError as exc:
        logger.warning("AI returned invalid reading-feedback fields.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa trả về được góp ý đúng định dạng. Vui lòng thử lại.",
        ) from exc

    try:
        saved = (
            supabase.table("reading_practice_turns")
            .update({
                "transcript": transcript,
                "ai_feedback": feedback.model_dump(),
            })
            .eq("id", str(turn_id))
            .eq("conversation_id", str(conversation_id))
            .select(
                "id,conversation_id,question,sample_answer,transcript,ai_feedback,created_at",
            )
            .single()
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not save reading-practice feedback.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu kết quả luyện tập. Vui lòng thử lại.",
        ) from exc

    if not saved.data:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu không trả về kết quả luyện tập.",
        )

    return BaseResponse(
        status="success",
        message="Đã lưu và đánh giá câu trả lời.",
        data=_reading_turn_response(saved.data),
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
@router.post(
    "/transcribe-voice",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def transcribe_chat_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[AudioTranscriptionResponse]:
    """Transcribe a temporary audio recording in the conversation's target language."""
    try:
        conversation_language = _verify_audio_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise
    language = _CHAT_ASR_LANGUAGE_CODES.get(conversation_language)
    if language is None:
        await audio.close()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Ngôn ngữ của phòng trò chuyện không được hỗ trợ nhận diện.",
        )
    upload_content_type = (audio.content_type or "audio/webm").split(";", maxsplit=1)[0].strip().lower()
    upload_filename = audio.filename or "voice.webm"
    audio_bytes = await _read_audio_upload(audio)
    transcript = await _transcribe_for_profile(
        audio_bytes,
        profile,
        language,
        filename=upload_filename,
        content_type=upload_content_type,
    )

    return BaseResponse(
        status="success",
        message="Đã chuyển giọng nói thành văn bản.",
        data=AudioTranscriptionResponse(transcript=transcript),
    )


@router.post(
    "/transcribe-voice",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def transcribe_voice_message(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[AudioTranscriptionResponse]:
    """Chép nguyên văn điều học viên vừa nói trong chế độ Đàm thoại.

    Không khoá ngôn ngữ theo phòng học: Whisper tự nhận diện, nói tiếng nào ra chữ tiếng đó.
    """
    try:
        _verify_audio_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise

    audio_bytes = await _read_audio_upload(audio)
    transcript = await _transcribe_for_profile(audio_bytes, profile, None)
    return BaseResponse(
        status="success",
        message="Đã chuyển giọng nói thành văn bản.",
        data=AudioTranscriptionResponse(transcript=transcript),
    )


@router.post(
    "/transcribe-practice",
    response_model=BaseResponse[AudioTranscriptionResponse],
)
async def transcribe_practice_audio(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[AudioTranscriptionResponse]:
    """Transcribe a learner's reading in the conversation's target language."""
    try:
        conversation_language = _verify_audio_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise
    language = _CHAT_ASR_LANGUAGE_CODES.get(conversation_language)
    if language is None:
        await audio.close()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Ngôn ngữ của phòng trò chuyện không được hỗ trợ nhận diện.",
        )
    upload_content_type = (audio.content_type or "audio/webm").split(";", maxsplit=1)[0].strip().lower()
    upload_filename = audio.filename or "voice.webm"
    audio_bytes = await _read_audio_upload(audio)
    transcript = await _transcribe_for_profile(
        audio_bytes,
        profile,
        language,
        filename=upload_filename,
        content_type=upload_content_type,
    )
    return BaseResponse(
        status="success",
        message="Đã nhận diện câu đọc.",
        data=AudioTranscriptionResponse(transcript=transcript),
    )


@router.post(
    "/pronunciation-turn",
    response_model=BaseResponse[PronunciationTurnResponse],
)
async def submit_pronunciation_turn(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[PronunciationTurnResponse]:
    """Học viên nói một câu: AI chấm phát âm + chính tả rồi mở nội dung kế tiếp."""
    try:
        language_code = _verify_audio_conversation(conversation_id, profile)
    except Exception:
        await audio.close()
        raise

    language = _CHAT_ASR_LANGUAGE_CODES.get(language_code)
    if language is None:
        await audio.close()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Ngôn ngữ của phòng trò chuyện không được hỗ trợ nhận diện.",
        )

    consume_daily_ai_call(profile)
    audio_bytes = await _read_audio_upload(audio)
    pronunciation_audio = await _prepare_pronunciation_audio(audio_bytes)
    transcript = (
        await _transcribe_for_profile(
            pronunciation_audio,
            profile,
            language,
            charge_quota=False,
        )
    ).strip()
    if not transcript or len(transcript) > 4000:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Không nhận diện được câu nói hợp lệ. Hãy nói rõ hơn rồi thử lại.",
        )

    try:
        previous_messages = (
            supabase.table("messages")
            .select("sender_type,content")
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=True)
            .limit(_CHAT_CONTEXT_MESSAGE_LIMIT)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not load previous AI practice messages.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải ngữ cảnh hội thoại lúc này. Vui lòng thử lại.",
        ) from exc

    history = [
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
        feedback_text = await AIService.evaluate_pronunciation_turn(
            pronunciation_audio,
            transcript,
            _CHAT_LANGUAGE_NAMES[language_code],
            profile.get("current_level") or "A1",
            history,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
            raise
        logger.exception("AI pronunciation turn evaluation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể chấm phát âm lúc này. Vui lòng thử lại.",
        ) from exc
    except Exception as exc:
        logger.exception("AI pronunciation turn evaluation failed.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa thể chấm phát âm lúc này. Vui lòng thử lại.",
        ) from exc

    try:
        feedback = PronunciationTurnFeedback.model_validate(
            _decode_ai_json_object(feedback_text, "pronunciation turn"),
        )
    except ValidationError as exc:
        logger.warning("AI returned invalid pronunciation-turn fields.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa trả về được kết quả chấm phát âm hợp lệ. Vui lòng thử lại.",
        ) from exc

    if not feedback.next_prompt:
        logger.warning("AI pronunciation turn returned no next prompt.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "AI chưa gợi ý được nội dung tiếp theo. Vui lòng thử lại.",
        )

    try:
        supabase.table("messages").insert([
            {
                "conversation_id": str(conversation_id),
                "sender_type": "user",
                "content": transcript,
            },
            {
                "conversation_id": str(conversation_id),
                "sender_type": "ai",
                "content": feedback.next_prompt,
                "ai_feedback": feedback.model_dump_json(),
            },
        ]).execute()
    except Exception as exc:
        logger.exception("Could not persist AI pronunciation turn messages.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu kết quả luyện tập lúc này. Vui lòng thử lại.",
        ) from exc

    return BaseResponse(
        status="success",
        message="Đã chấm phát âm và chuẩn bị nội dung tiếp theo.",
        data=PronunciationTurnResponse(
            conversation_id=conversation_id,
            transcript=transcript,
            ai_response=feedback.next_prompt,
            ai_feedback=feedback,
        ),
    )


def _load_chat_context(
    conversation_id: UUID,
    profile: Dict[str, Any],
) -> tuple[str, list[dict[str, str]]]:
    try:
        conv = (
            supabase.table("conversations")
            .select("language_code")
            .eq("id", str(conversation_id))
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
            .eq("conversation_id", str(conversation_id))
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
    return language_code, conversation_history


def _save_chat_turn(
    conversation_id: UUID,
    user_message: str,
    ai_reply: str,
    ai_feedback: str,
) -> None:
    try:
        supabase.table("messages").insert([
            {
                "conversation_id": str(conversation_id),
                "sender_type": "user",
                "content": user_message,
            },
            {
                "conversation_id": str(conversation_id),
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


async def _send_message(
    data: MessageSend,
    profile: Dict[str, Any],
    *,
    quota_already_consumed: bool = False,
) -> BaseResponse[MessageResponse]:
    language_code, conversation_history = _load_chat_context(data.conversation_id, profile)

    if not quota_already_consumed:
        consume_daily_ai_call(profile)
    try:
        ai_reply, ai_feedback = await AIService.generate_chat_response(
            data.user_message,
            _CHAT_LANGUAGE_NAMES[language_code],
            profile.get("current_level") or "A1",
            conversation_history=conversation_history,
            grammar_mode=data.grammar_mode,
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

    _save_chat_turn(data.conversation_id, data.user_message, ai_reply, ai_feedback)

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


@router.post("/send-message", response_model=BaseResponse[MessageResponse])
async def send_message(
    data: MessageSend,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[MessageResponse]:
    """Gửi tin nhắn, gọi AIService và lưu trữ lịch sử qua Supabase."""
    return await _send_message(data, profile)


@router.post("/send-message-stream")
async def send_message_stream(
    data: MessageSend,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> StreamingResponse:
    """Stream phản hồi AI theo thời gian thực (SSE) và lưu lịch sử khi hoàn tất."""
    language_code, conversation_history = _load_chat_context(data.conversation_id, profile)
    consume_daily_ai_call(profile)

    async def event_stream():
        try:
            async for event in AIService.stream_chat_response(
                data.user_message,
                _CHAT_LANGUAGE_NAMES[language_code],
                profile.get("current_level") or "A1",
                conversation_history=conversation_history,
                grammar_mode=data.grammar_mode,
            ):
                if event.get("type") == "done":
                    ai_reply = event["ai_response"]
                    ai_feedback = event["ai_feedback"]
                    _save_chat_turn(data.conversation_id, data.user_message, ai_reply, ai_feedback)
                    payload = {
                        "type": "done",
                        "conversation_id": str(data.conversation_id),
                        "user_message": data.user_message,
                        "ai_response": ai_reply,
                        "ai_feedback": ai_feedback,
                    }
                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                else:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': exc.detail}, ensure_ascii=False)}\n\n"
        except Exception:
            logger.exception("AI chat streaming failed.")
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI chưa thể phản hồi lúc này. Vui lòng thử lại.'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/send-voice-message", response_model=BaseResponse[MessageResponse])
async def send_voice_message(
    conversation_id: UUID = Form(...),
    audio: UploadFile = File(...),
    profile: Dict[str, Any] = Depends(get_current_profile),
    grammar_mode: Annotated[bool, Form()] = False,
) -> BaseResponse[MessageResponse]:
    transcription = await transcribe_chat_audio(conversation_id, audio, profile)
    transcript = transcription.data.transcript.strip()
    if not transcript or len(transcript) > 4000:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Không nhận diện được lời nói hợp lệ để gửi.",
        )

    return await _send_message(
        MessageSend(
            conversation_id=conversation_id,
            user_message=transcript,
            grammar_mode=grammar_mode,
        ),
        profile,
        quota_already_consumed=True,
    )


@router.post("/tts")
async def synthesize_chat_audio(
    data: TTSRequest,
    _profile: Dict[str, Any] = Depends(get_current_profile),
) -> Response:
    if data.provider == "auto" and _adsup_keys():
        return await _synthesize_with_adsup(data)
    if data.provider == "edge":
        return await _synthesize_with_edge_library(data)

    service_url = settings.EDGE_TTS_BASE_URL.strip().rstrip("/")
    if not service_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Dịch vụ giọng đọc chưa được cấu hình.",
        )

    headers = {"Accept": "audio/mpeg"}
    if settings.EDGE_TTS_API_KEY:
        headers["Authorization"] = f"Bearer {settings.EDGE_TTS_API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{service_url}/v1/audio/speech",
                headers=headers,
                json={
                    "model": "tts-1",
                    "input": data.text,
                    "voice": _CHAT_TTS_VOICES[data.language],
                    "response_format": "mp3",
                    "speed": 1.0,
                },
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        logger.warning("Edge TTS request timed out.")
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "Dịch vụ giọng đọc phản hồi quá chậm.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.warning("Edge TTS returned HTTP %d.", exc.response.status_code)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Dịch vụ giọng đọc hiện không khả dụng.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("Edge TTS connection failed (%s).", type(exc).__name__)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không kết nối được với dịch vụ giọng đọc.",
        ) from exc

    content_type = response.headers.get("content-type", "").split(";", maxsplit=1)[0].lower()
    audio_content_types = {"audio/mpeg", "audio/mp3", "application/octet-stream"}
    if not response.content or content_type not in audio_content_types:
        logger.warning("Edge TTS returned an empty or non-audio response.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Dịch vụ giọng đọc trả về dữ liệu không hợp lệ.",
        )

    return Response(
        content=response.content,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


async def _synthesize_with_edge_library(data: TTSRequest) -> Response:
    voice = _CHAT_TTS_VOICES[data.language]
    rate = f"{round((data.speed - 1.0) * 100):+d}%"

    async def collect() -> bytes:
        communicate = edge_tts.Communicate(data.text, voice, rate=rate)
        chunks = [
            chunk["data"]
            async for chunk in communicate.stream()
            if chunk["type"] == "audio"
        ]
        return b"".join(chunks)

    try:
        content = await asyncio.wait_for(collect(), timeout=30.0)
    except asyncio.TimeoutError as exc:
        logger.warning("Edge TTS library timed out.")
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "Dịch vụ giọng đọc phản hồi quá chậm.",
        ) from exc
    except Exception as exc:
        logger.warning("Edge TTS library failed (%s).", type(exc).__name__)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Dịch vụ giọng đọc Edge hiện không khả dụng.",
        ) from exc

    if not content:
        logger.warning("Edge TTS library returned no audio.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Dịch vụ giọng đọc trả về dữ liệu không hợp lệ.",
        )

    return Response(
        content=content,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


async def _synthesize_with_adsup(data: TTSRequest) -> Response:
    language = _CHAT_TTS_LANGUAGE_CODES[data.language]
    payload = {
        "text": data.text,
        "voice_id": data.voice_id or _ADSUP_DEFAULT_VOICES[language],
        "language": language,
        "speed": data.speed,
    }
    # ADSUP chỉ nhận JSON escape \uXXXX; UTF-8 thô bị báo lỗi parse body
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    keys = _adsup_keys()
    url = f"{settings.ADSUP_TTS_BASE_URL.strip().rstrip('/')}/api/external/tts"

    for key_index, key in enumerate(keys, start=1):
        try:
            async with _adsup_client() as client:
                response = await client.post(
                    url,
                    headers={
                        "X-API-Key": key,
                        "Idempotency-Key": uuid4().hex,
                        "Content-Type": "application/json",
                    },
                    content=body,
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            logger.warning("ADSUP TTS request timed out.")
            raise HTTPException(
                status.HTTP_504_GATEWAY_TIMEOUT,
                "Dịch vụ giọng đọc phản hồi quá chậm.",
            ) from exc
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            if code in _ADSUP_KEY_ERROR_CODES:
                logger.warning(
                    "ADSUP key %d/%d bị từ chối hoặc hết hạn mức (HTTP %d) — thử key kế tiếp.",
                    key_index,
                    len(keys),
                    code,
                )
                continue
            logger.warning("ADSUP TTS returned HTTP %d.", code)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Dịch vụ giọng đọc hiện không khả dụng.",
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning("ADSUP TTS connection failed (%s).", type(exc).__name__)
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Không kết nối được với dịch vụ giọng đọc.",
            ) from exc

        content_type = response.headers.get("content-type", "").split(";", maxsplit=1)[0].lower()
        if not response.content or content_type not in {"audio/wav", "audio/x-wav", "application/octet-stream"}:
            logger.warning("ADSUP TTS returned an empty or non-audio response.")
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Dịch vụ giọng đọc trả về dữ liệu không hợp lệ.",
            )

        return Response(
            content=response.content,
            media_type=content_type,
            headers={"Cache-Control": "no-store"},
        )

    raise HTTPException(
        status.HTTP_502_BAD_GATEWAY,
        "Tất cả key ADSUP đều hết hạn mức hoặc bị từ chối.",
    )


@router.get("/tts/voices")
async def list_chat_voices(
    _profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[Dict[str, Any]]:
    """Danh sách giọng (tone) công khai ADSUP cho 3 ngôn ngữ của app."""
    try:
        async with _adsup_client() as client:
            response = await client.get(
                f"{settings.ADSUP_TTS_BASE_URL.strip().rstrip('/')}/demo/voices"
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "Dịch vụ giọng đọc phản hồi quá chậm.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.warning("ADSUP voices returned HTTP %d.", exc.response.status_code)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Dịch vụ giọng đọc hiện không khả dụng.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("ADSUP voices connection failed (%s).", type(exc).__name__)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không kết nối được với dịch vụ giọng đọc.",
        ) from exc

    voices = [
        {field: voice.get(field) for field in _ADSUP_VOICE_FIELDS}
        for voice in payload.get("voices", [])
        if voice.get("language") in _ADSUP_DEFAULT_VOICES
    ]
    return BaseResponse(data={"voices": voices, "defaults": _ADSUP_DEFAULT_VOICES})


@router.get("/tts/voices/{voice_id}/preview")
async def preview_chat_voice(
    voice_id: str,
    _profile: Dict[str, Any] = Depends(get_current_profile),
) -> Response:
    try:
        UUID(voice_id)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "voice_id không hợp lệ.",
        ) from exc

    try:
        async with _adsup_client() as client:
            response = await client.get(
                f"{settings.ADSUP_TTS_BASE_URL.strip().rstrip('/')}/demo/voices/{voice_id}/preview-audio"
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("ADSUP preview failed (%s).", type(exc).__name__)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Không tải được bản nghe thử của giọng này.",
        ) from exc

    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "audio/mpeg").split(";", maxsplit=1)[0],
        headers={"Cache-Control": "public, max-age=86400"},
    )