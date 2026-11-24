import logging
import re
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.deps import get_current_profile
from app.db.supabase import supabase_admin
from app.services.writing_ai_service import (
    WritingAIError,
    evaluate_writing,
    generate_topics,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_MIN_WORDS_FOR_XP = 30


class WritingEvaluateRequest(BaseModel):
    language: str = Field(default="en", min_length=2, max_length=30)
    level: str = Field(default="", max_length=10)
    topic_title: str = Field(min_length=1, max_length=160)
    topic_prompt: str = Field(default="", max_length=600)
    text: str = Field(min_length=20, max_length=6000)


def _resolve_level(profile: Dict[str, Any], requested: str) -> str:
    return (requested or str(profile.get("current_level") or "A2")).strip().upper()


def _count_words(text: str, language: str) -> int:
    """CJK (Nhật/Trung/Hàn) không tách bằng dấu cách -> đếm ký tự + từ latin."""
    if str(language).lower() in {"ja", "zh", "ko"}:
        cjk = len(re.findall(r"[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\uac00-\ud7af]", text))
        latin = len(re.findall(r"[A-Za-z0-9\u00c0-\u024f]+", text))
        return cjk + latin
    return len(text.split())


@router.get("/topics")
def reading_topics(
    language: str = Query(default="en"),
    level: str = Query(default=""),
    count: int = Query(default=3, ge=1, le=6),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Đề bài viết cho ngôn ngữ đang học của học viên."""
    topics = generate_topics(
        language or str(profile.get("target_language") or "en"),
        _resolve_level(profile, level),
        count,
    )
    return {
        "status": "success",
        "data": {
            "language": language,
            "level": _resolve_level(profile, level),
            "topics": [topic.model_dump() for topic in topics],
        },
    }


@router.post("/evaluate")
def evaluate(
    payload: WritingEvaluateRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Chấm đoạn văn bằng AI và cộng XP qua RPC có sẵn (không bảng mới)."""
    try:
        evaluation = evaluate_writing(
            payload.language,
            _resolve_level(profile, payload.level),
            payload.topic_title,
            payload.topic_prompt,
            payload.text,
        )
    except WritingAIError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Bộ chấm AI hiện không khả dụng. Bài của bạn chưa được ghi nhận XP.",
        ) from exc

    word_count = _count_words(payload.text, payload.language)
    xp = 0
    if evaluation.overall >= 5 and word_count >= _MIN_WORDS_FOR_XP:
        xp = min(40, 10 + evaluation.overall * 3)

    activity = None
    if xp:
        try:
            activity = (
                supabase_admin.rpc(
                    "record_lesson_activity",
                    {"p_user_id": str(profile["id"]), "p_xp": xp},
                )
                .execute()
                .data
            )
        except Exception as exc:
            logger.warning("Writing XP was not recorded (%s).", type(exc).__name__)
            xp = 0

    return {
        "status": "success",
        "data": {
            "evaluation": evaluation.model_dump(),
            "word_count": word_count,
            "xp": xp,
            "activity": activity,
        },
    }
