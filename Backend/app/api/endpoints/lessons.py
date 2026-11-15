from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Path, Query

from app.core.deps import get_current_profile
from app.schemas.learning import (
    LessonAnswerResult,
    LessonAnswerSubmit,
    LessonCompletionResult,
)
from app.schemas.reponse import BaseResponse
from app.services.learning_service import (
    complete_lesson,
    get_lesson_questions,
    list_topic_lessons,
    submit_lesson_answer,
)

router = APIRouter()


@router.get("/topics/{topic_id}/lessons", response_model=BaseResponse[list[Dict[str, Any]]])
def get_topic_lessons(
    topic_id: int = Path(ge=1),
    path_id: Optional[int] = Query(default=None, ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã tải danh sách bài học.",
        data=list_topic_lessons(topic_id, profile, path_id),
    )


@router.get("/{lesson_id}/questions", response_model=BaseResponse[Dict[str, Any]])
def get_questions(
    lesson_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã tải câu hỏi bài học.",
        data=get_lesson_questions(lesson_id, profile),
    )


@router.post(
    "/questions/{question_id}/answer",
    response_model=BaseResponse[LessonAnswerResult],
)
def check_answer(
    data: LessonAnswerSubmit,
    question_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã kiểm tra đáp án.",
        data=submit_lesson_answer(profile, question_id, data.selected_option_id),
    )


@router.post(
    "/{lesson_id}/complete",
    response_model=BaseResponse[LessonCompletionResult],
)
def finish_lesson(
    lesson_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã hoàn thành bài học.",
        data=complete_lesson(profile, lesson_id),
    )
