from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Path, Query

from app.api.endpoints.chat_ai import synthesize_chat_audio
from app.core.deps import get_current_profile
from app.schemas.chat_ai import TTSRequest
from app.schemas.learning import (
    BossQuizGradeRequest,
    BossQuizRequest,
    BossQuizSpeakRequest,
    DungeonProgressUpdate,
    LessonAnswerResult,
    LessonAnswerSubmit,
    LessonCompletionResult,
)
from app.schemas.reponse import BaseResponse
from app.services.learning_service import (
    _ensure_topic_access,
    boss_speak_text,
    complete_lesson,
    generate_boss_quiz,
    get_dungeon_progress,
    get_lesson_questions,
    get_topic_readings,
    grade_boss_quiz,
    list_topic_lessons,
    save_dungeon_progress,
    submit_lesson_answer,
)

router = APIRouter()


@router.get("/topics/{topic_id}/readings", response_model=BaseResponse[Dict[str, Any]])
def get_topic_readings_route(
    topic_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    _ensure_topic_access(topic_id, profile)
    return BaseResponse(
        status="success",
        message="Đã tải bài đọc theo tầng.",
        data=get_topic_readings(topic_id),
    )


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


@router.get("/topics/{topic_id}/dungeon-progress", response_model=BaseResponse[Dict[str, Any]])
def get_dungeon_progress_route(
    topic_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã tải tiến trình ải.",
        data={"completed_nodes": get_dungeon_progress(profile, topic_id)},
    )


@router.post("/topics/{topic_id}/dungeon-progress", response_model=BaseResponse[Dict[str, Any]])
def save_dungeon_progress_route(
    payload: DungeonProgressUpdate,
    topic_id: int = Path(ge=1),
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    completed = save_dungeon_progress(profile, topic_id, payload.completed_nodes)
    return BaseResponse(
        status="success",
        message="Đã lưu tiến trình ải.",
        data={"completed_nodes": completed},
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


@router.post("/boss-quiz", response_model=BaseResponse[Dict[str, Any]])
def create_boss_quiz(
    data: BossQuizRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã tạo bài kiểm tra Boss bằng AI.",
        data=generate_boss_quiz(profile, data.topic_id, data.path_id),
    )


@router.post("/boss-quiz/grade", response_model=BaseResponse[Dict[str, Any]])
def grade_boss_quiz_route(
    data: BossQuizGradeRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã chấm bài kiểm tra Boss.",
        data=grade_boss_quiz(
            profile, data.quiz_token, [answer.model_dump() for answer in data.answers]
        ),
    )


@router.post("/boss-quiz/speak")
async def speak_boss_answer(
    data: BossQuizSpeakRequest,
    profile: Dict[str, Any] = Depends(get_current_profile),
):
    text, language = boss_speak_text(profile, data.quiz_token, data.index)
    return await synthesize_chat_audio(
        TTSRequest(text=text, language=language, provider="edge"), profile
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
