from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.deps import get_current_profile
from app.db.supabase import supabase_admin
from app.services.minigame_service import get_minigame_state
from app.schemas.minigame import (
    MiniGameEvaluationRequest,
    MiniGameEvaluationResponse,
)
from app.services.minigame_ai_service import (
    MiniGameAIError,
    evaluate_minigame_answer,
)

router = APIRouter()


class MiniGameProgress(BaseModel):
    xp: int = Field(default=0, ge=0, le=5000)
    word_ids: list[int] = Field(default_factory=list, max_length=120)


@router.post("/evaluate", response_model=dict)
def evaluate_answer(
    payload: MiniGameEvaluationRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Evaluate one attack with a dedicated, strict mini-game AI prompt."""
    del profile
    try:
        evaluation: MiniGameEvaluationResponse = evaluate_minigame_answer(payload)
        return {"status": "success", "data": evaluation.model_dump()}
    except MiniGameAIError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Bộ chấm AI mini game hiện không khả dụng. Chưa ghi nhận lượt đánh.",
        ) from exc


@router.get("/state")
def get_state(
    card_count: int = Query(default=60, ge=6, le=120),
    language: Optional[str] = Query(default=None),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Return the authenticated player's vocabulary and RAG rules for the mini game."""
    try:
        return {"status": "success", "data": get_minigame_state(profile, card_count, language)}
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải dữ liệu mini game từ cơ sở dữ liệu.",
        ) from exc


@router.post("/progress")
def save_progress(
    payload: MiniGameProgress,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Persist the completed run without exposing the service-role RPC to clients."""
    user_id = str(profile["id"])
    try:
        if payload.word_ids:
            existing = (
                supabase_admin.table("user_words")
                .select("word_id,mastery_level,review_count")
                .eq("user_id", user_id)
                .in_("word_id", payload.word_ids)
                .execute()
                .data
                or []
            )
            by_word_id = {row["word_id"]: row for row in existing} # type: ignore
            reviewed_at = datetime.now(timezone.utc)
            rows = []
            for word_id in set(payload.word_ids):
                current = by_word_id.get(word_id, {})
                mastery = min(5, int(current.get("mastery_level") or 0) + 1) # type: ignore
                rows.append(
                    {
                        "user_id": user_id,
                        "word_id": word_id,
                        "mastery_level": mastery,
                        "review_count": int(current.get("review_count") or 0) + 1, # type: ignore
                        "last_reviewed_at": reviewed_at.isoformat(),
                        "next_review_at": (reviewed_at + timedelta(days=max(1, mastery))).isoformat(),
                    }
                )
            supabase_admin.table("user_words").upsert(
                rows, on_conflict="user_id,word_id"
            ).execute()

        activity = supabase_admin.rpc(
            "record_lesson_activity",
            {"p_user_id": user_id, "p_xp": payload.xp},
        ).execute().data
        return {"status": "success", "data": {"xp": payload.xp, "activity": activity}}
    except Exception as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu tiến độ mini game.",
        ) from exc
