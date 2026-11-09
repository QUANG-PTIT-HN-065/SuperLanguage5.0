import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError

from app.core.deps import get_current_profile
from app.db.supabase import supabase_admin
from app.schemas.reponse import BaseResponse
from app.schemas.vocabulary import (
    VocabularyReviewComplete,
    VocabularyReviewCompletionResult,
)
from app.services.vocabulary_service import list_topics, list_words

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/topics")
def get_topics(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Danh sách chủ đề theo ngôn ngữ đang học và gói hiện tại."""
    return list_topics(profile, limit, offset)


@router.get("/words")
def get_words(
    topic_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Danh sách từ vựng trong ngôn ngữ đang học, có thể lọc theo chủ đề."""
    return list_words(profile, limit, offset, topic_id)


@router.post(
    "/review-sessions/complete",
    response_model=BaseResponse[VocabularyReviewCompletionResult],
)
def complete_review_session(
    data: VocabularyReviewComplete,
    profile: Dict[str, Any] = Depends(get_current_profile),
) -> BaseResponse[VocabularyReviewCompletionResult]:
    """Ghi nhận một phiên ôn từ vựng và cộng XP do máy chủ tính."""
    try:
        result = supabase_admin.rpc(
            "complete_vocabulary_review_session",
            {
                "p_user_id": profile["id"],
                "p_session_id": str(data.session_id),
                "p_reviewed_count": data.reviewed_count,
                "p_known_count": data.known_count,
            },
        ).execute()
    except Exception as exc:
        logger.exception("Could not complete vocabulary review session.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu phiên ôn tập lúc này. Vui lòng thử lại.",
        ) from exc

    try:
        completion = VocabularyReviewCompletionResult.model_validate(result.data)
    except ValidationError as exc:
        logger.exception("Vocabulary review RPC returned an invalid result.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Máy chủ chưa trả về kết quả phiên ôn tập hợp lệ.",
        ) from exc

    return BaseResponse(
        status="success",
        message=(
            "Phiên ôn tập đã được ghi nhận."
            if not completion.already_completed
            else "Phiên ôn tập này đã được ghi nhận trước đó."
        ),
        data=completion,
    )
