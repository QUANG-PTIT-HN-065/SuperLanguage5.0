import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError

from app.core.deps import get_current_profile
from app.db.supabase import supabase_admin
from app.schemas.reponse import BaseResponse
from app.schemas.vocabulary import (
    LearningPathCreate,
    LearningPathUpdate,
    VocabularyReviewComplete,
    VocabularyReviewCompletionResult,
)
from app.services.learning_path_service import (
    create_learning_path,
    delete_learning_path,
    list_learning_paths,
    update_learning_path,
)
from app.services.vocabulary_service import list_topics, list_words

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/topics", response_model=BaseResponse[Dict[str, Any]])
def get_topics(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Danh sách chủ đề theo ngôn ngữ đang học và gói hiện tại."""
    return BaseResponse(
        status="success",
        message="Đã tải danh sách chủ đề.",
        data=list_topics(profile, limit, offset),
    )


@router.get("/words", response_model=BaseResponse[Dict[str, Any]])
def get_words(
    topic_id: Optional[int] = Query(default=None, ge=1),
    q: Optional[str] = Query(default=None, min_length=1, max_length=80, pattern=r"^[\w\s'-]+$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Danh sách từ vựng trong ngôn ngữ đang học, có thể lọc theo chủ đề."""
    return BaseResponse(
        status="success",
        message="Đã tải danh sách từ vựng.",
        data=list_words(profile, limit, offset, topic_id, q),
    )


@router.get("/learning-paths", response_model=BaseResponse[list[Dict[str, Any]]])
def get_learning_paths(profile: Dict[str, Any] = Depends(get_current_profile)):
    """Lộ trình và các chủ đề người học có quyền truy cập."""
    accessible_topics: Dict[int, Dict[str, Any]] = {}
    offset = 0
    while True:
        page = list_topics(profile, limit=100, offset=offset)
        page_items = page["items"]
        accessible_topics.update({topic["id"]: topic for topic in page_items})
        offset += len(page_items)
        if not page_items or offset >= page["available"]:
            break

    paths = list_learning_paths(profile["target_language"])
    visible_paths = []
    for path in paths:
        path_topics = [
            topic for topic in path["topics"] if topic["id"] in accessible_topics
        ]
        if path_topics:
            visible_paths.append({
                key: value for key, value in path.items() if key != "topics"
            } | {"topic_count": len(path_topics)})
    return BaseResponse(
        status="success",
        message="Đã tải danh sách lộ trình.",
        data=visible_paths,
    )


@router.get(
    "/learning-paths/{path_id}",
    response_model=BaseResponse[Dict[str, Any]],
)
def get_learning_path(
    path_id: int,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    """Chi tiết lộ trình với danh sách chủ đề có thể học."""
    accessible_topics: Dict[int, Dict[str, Any]] = {}
    offset = 0
    while True:
        page = list_topics(profile, limit=100, offset=offset)
        page_items = page["items"]
        accessible_topics.update({topic["id"]: topic for topic in page_items})
        offset += len(page_items)
        if not page_items or offset >= page["available"]:
            break

    path = next(
        (
            item
            for item in list_learning_paths(profile["target_language"])
            if item["id"] == path_id
        ),
        None,
    )
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lộ trình.")

    topics = []
    for topic in path["topics"]:
        if topic["id"] not in accessible_topics:
            continue
        page = list_words(profile, limit=1, offset=0, topic_id=topic["id"])
        topics.append({**topic, "word_count": page["available"]})
    return BaseResponse(
        status="success",
        message="Đã tải nội dung lộ trình.",
        data={**{key: value for key, value in path.items() if key != "topics"}, "topics": topics},
    )


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
