import logging
import re
from typing import Any, Dict
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.db.supabase import supabase_admin
from app.schemas.learning import (
    LessonAnswerResult,
    LessonCompletionResult,
    LessonQuestionPublic,
    VocabularyWordReviewResult,
)
from app.services.vocabulary_service import list_topics

logger = logging.getLogger(__name__)


def _ensure_topic_access(topic_id: int, profile: Dict[str, Any]) -> None:
    offset = 0
    while True:
        page = list_topics(profile, limit=100, offset=offset)
        if any(topic["id"] == topic_id for topic in page["items"]):
            return
        offset += len(page["items"])
        if not page["items"] or offset >= page["available"]:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Chủ đề này chưa được mở cho tài khoản của bạn.",
            )


def _rpc_error(exc: Exception) -> HTTPException:
    code = str(getattr(exc, "code", "") or "")
    if code == "P0002":
        return HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy nội dung học.")
    if code == "42501":
        return HTTPException(status.HTTP_403_FORBIDDEN, "Bạn cần hoàn thành bài trước để mở nội dung này.")
    if code == "23514":
        return HTTPException(status.HTTP_409_CONFLICT, "Lựa chọn hoặc trạng thái bài học không hợp lệ.")
    logger.exception("Learning database RPC failed.")
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Không thể lưu tiến độ học lúc này. Vui lòng thử lại.",
    )


def _validate_result(model: type, data: Any, message: str):
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        logger.exception("Learning RPC returned an invalid result.")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, message) from exc


def _build_topic_quiz(words: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    unique_words = []
    seen_words = set()
    for item in words:
        word = item.get("word")
        meaning = item.get("meaning")
        if not isinstance(word, str) or not word.strip() or not isinstance(meaning, str) or not meaning.strip():
            continue
        normalized = word.strip().casefold()
        if normalized in seen_words:
            continue
        seen_words.add(normalized)
        unique_words.append({**item, "word": word.strip(), "meaning": meaning.strip()})

    if len(unique_words) < 4:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Chủ đề cần có ít nhất 4 từ vựng hợp lệ trước khi tạo bài kiểm tra.",
        )

    selected = unique_words[:4]
    questions = []
    for index, word in enumerate(selected):
        explanation = word.get("example_meaning") or word["meaning"]
        if index < 2:
            sentence = word.get("example_sentence")
            blanked_sentence = None
            if isinstance(sentence, str) and sentence.strip():
                pattern = re.compile(
                    rf"(?<!\w){re.escape(word['word'])}(?!\w)",
                    flags=re.IGNORECASE,
                )
                blanked_sentence = pattern.sub("________", sentence.strip(), count=1)
                if blanked_sentence == sentence.strip():
                    blanked_sentence = None
            prompt = (
                f"Điền từ còn thiếu: {blanked_sentence}"
                if blanked_sentence
                else f"Điền từ tương ứng với nghĩa “{word['meaning']}”: ________."
            )
            questions.append({
                "prompt": prompt,
                "question_type": "fill_in",
                "options": [],
                "correct_option_id": word["word"],
                "explanation": explanation,
                "sort_order": index + 1,
            })
            continue

        rotated_options = selected[index - 2:] + selected[:index - 2]
        questions.append({
            "prompt": f"Từ nào có nghĩa là “{word['meaning']}”?",
            "question_type": "multiple_choice",
            "options": [
                {"id": str(option["id"]), "text": option["word"]}
                for option in rotated_options
            ],
            "correct_option_id": str(word["id"]),
            "explanation": explanation,
            "sort_order": index + 1,
        })
    return questions


def get_path_topic_states(
    path_id: int,
    user_id: str,
    topics: list[Dict[str, Any]],
) -> Dict[int, Dict[str, Any]]:
    topic_ids = [topic["id"] for topic in topics]
    if not topic_ids:
        return {}
    try:
        quizzes = (
            supabase_admin.table("lessons")
            .select("id,topic_id")
            .eq("learning_path_id", path_id)
            .eq("is_topic_quiz", True)
            .eq("is_active", True)
            .in_("topic_id", topic_ids)
            .execute()
            .data
            or []
        )
        quiz_ids = [quiz["id"] for quiz in quizzes]
        progress_rows = (
            supabase_admin.table("lesson_progress")
            .select("lesson_id,score,question_count")
            .eq("user_id", user_id)
            .in_("lesson_id", quiz_ids)
            .execute()
            .data
            or []
            if quiz_ids
            else []
        )
    except Exception as exc:
        logger.exception("Could not load learning-path topic progress.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải tiến độ chủ đề lúc này. Vui lòng thử lại.",
        ) from exc

    progress_by_quiz = {
        row["lesson_id"]: row
        for row in progress_rows
        if row.get("score") == row.get("question_count")
    }
    quiz_by_topic = {quiz["topic_id"]: quiz for quiz in quizzes}
    passed_topic_ids = {
        topic_id
        for topic_id, quiz in quiz_by_topic.items()
        if quiz["id"] in progress_by_quiz
    }
    states: Dict[int, Dict[str, Any]] = {}
    previous_topics_passed = True
    for topic in topics:
        topic_id = topic["id"]
        quiz = quiz_by_topic.get(topic_id)
        progress = progress_by_quiz.get(quiz["id"]) if quiz else None
        states[topic_id] = {
            "is_locked": not previous_topics_passed,
            "is_completed": topic_id in passed_topic_ids,
            "quiz_score": progress["score"] if progress else None,
            "quiz_question_count": progress["question_count"] if progress else None,
        }
        previous_topics_passed = previous_topics_passed and topic_id in passed_topic_ids
    return states


def _path_language_and_topics(
    path_id: int,
    topic_id: int,
    profile: Dict[str, Any],
) -> tuple[str, list[Dict[str, Any]]]:
    try:
        paths = (
            supabase_admin.table("learning_paths")
            .select("id,language_code")
            .eq("id", path_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not paths or paths[0]["language_code"] != profile["target_language"]:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy lộ trình.")
        topics = (
            supabase_admin.table("learning_path_topics")
            .select("topic_id,sort_order")
            .eq("learning_path_id", path_id)
            .order("sort_order")
            .order("topic_id")
            .execute()
            .data
            or []
        )
        if topic_id not in {row["topic_id"] for row in topics}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chủ đề không thuộc lộ trình này.")
        return paths[0]["language_code"], topics
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not load learning-path topic order.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải thứ tự chủ đề lúc này. Vui lòng thử lại.",
        ) from exc


def _ensure_path_topic_unlocked(
    path_id: int,
    topic_id: int,
    profile: Dict[str, Any],
) -> str:
    language_code, links = _path_language_and_topics(path_id, topic_id, profile)
    ordered_topics = [{"id": link["topic_id"]} for link in links]
    state = get_path_topic_states(path_id, profile["id"], ordered_topics).get(topic_id)
    if state is None or state["is_locked"]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Bạn cần đạt 4/4 ở chủ đề trước để mở chủ đề này.",
        )
    return language_code


def _ensure_topic_quiz(path_id: int, topic_id: int, language_code: str) -> None:
    try:
        existing = (
            supabase_admin.table("lessons")
            .select("id")
            .eq("learning_path_id", path_id)
            .eq("topic_id", topic_id)
            .eq("is_topic_quiz", True)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            return
        word_links = (
            supabase_admin.table("word_topics")
            .select("word_id")
            .eq("topic_id", topic_id)
            .execute()
            .data
            or []
        )
        word_ids = list(dict.fromkeys(row["word_id"] for row in word_links))
        if len(word_ids) < 4:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Chủ đề cần có ít nhất 4 từ vựng trước khi tạo bài kiểm tra.",
            )
        words = (
            supabase_admin.table("words")
            .select("id,word,meaning,example_sentence,example_meaning")
            .eq("language_code", language_code)
            .in_("id", word_ids)
            .order("id")
            .execute()
            .data
            or []
        )
        questions = _build_topic_quiz(words)
        response = supabase_admin.rpc(
            "admin_create_topic_quiz",
            {
                "p_path_id": path_id,
                "p_topic_id": topic_id,
                "p_questions": questions,
            },
        ).execute()
        result = response.data
        if not isinstance(result, dict) or not result.get("lesson_id"):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Cơ sở dữ liệu không trả về thông tin bài kiểm tra.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not create vocabulary topic quiz.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tạo bài kiểm tra từ vựng lúc này. Vui lòng thử lại.",
        ) from exc


def list_topic_lessons(
    topic_id: int,
    profile: Dict[str, Any],
    path_id: int | None = None,
) -> list[Dict[str, Any]]:
    try:
        _ensure_topic_access(topic_id, profile)
        if path_id is not None:
            language_code = _ensure_path_topic_unlocked(path_id, topic_id, profile)
            _ensure_topic_quiz(path_id, topic_id, language_code)

        lessons = (
            supabase_admin.table("lessons")
            .select(
                "id,topic_id,learning_path_id,is_topic_quiz,title,description,sort_order,xp_reward"
            )
            .eq("topic_id", topic_id)
            .eq("is_active", True)
            .order("sort_order")
            .order("id")
            .execute()
            .data
            or []
        )
        if path_id is not None:
            lessons = [
                lesson for lesson in lessons
                if lesson.get("learning_path_id") in (None, path_id)
            ]
            lessons.sort(
                key=lambda lesson: (
                    not lesson.get("is_topic_quiz", False),
                    lesson["sort_order"],
                    lesson["id"],
                )
            )
        if not lessons:
            return []

        lesson_ids = [lesson["id"] for lesson in lessons]
        completed_rows = (
            supabase_admin.table("lesson_progress")
            .select("lesson_id,score,question_count,completed_at")
            .eq("user_id", profile["id"])
            .in_("lesson_id", lesson_ids)
            .execute()
            .data
            or []
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not load topic lessons.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải bài học lúc này. Vui lòng thử lại.",
        ) from exc

    completed = {row["lesson_id"]: row for row in completed_rows}
    earlier_unfinished = False
    result = []
    for lesson in lessons:
        progress = completed.get(lesson["id"])
        result.append({
            "id": lesson["id"],
            "title": lesson["title"],
            "description": lesson.get("description"),
            "xp_reward": lesson["xp_reward"],
            "is_completed": progress is not None,
            "is_locked": earlier_unfinished and progress is None,
            "can_retake": not lesson.get("is_topic_quiz", False),
            "score": progress["score"] if progress else None,
            "question_count": progress["question_count"] if progress else None,
        })
        if progress is None:
            earlier_unfinished = True
    return result


def get_lesson_questions(lesson_id: int, profile: Dict[str, Any]) -> Dict[str, Any]:
    try:
        lesson_rows = (
            supabase_admin.table("lessons")
            .select(
                "id,topic_id,learning_path_id,is_topic_quiz,title,description,sort_order"
            )
            .eq("id", lesson_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
        )
        if not lesson_rows:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy bài học.")
        lesson = lesson_rows[0]
        _ensure_topic_access(lesson["topic_id"], profile)
        if lesson.get("is_topic_quiz") and lesson.get("learning_path_id"):
            _ensure_path_topic_unlocked(
                lesson["learning_path_id"],
                lesson["topic_id"],
                profile,
            )

        all_topic_lessons = (
            supabase_admin.table("lessons")
            .select("id,sort_order,learning_path_id,is_topic_quiz")
            .eq("topic_id", lesson["topic_id"])
            .eq("is_active", True)
            .order("sort_order")
            .order("id")
            .execute()
            .data
            or []
        )
        lesson_rows = [
            row for row in all_topic_lessons
            if row.get("learning_path_id") in (None, lesson.get("learning_path_id"))
        ]
        lesson_ids = [row["id"] for row in lesson_rows]
        progress_rows = (
            supabase_admin.table("lesson_progress")
            .select("lesson_id")
            .eq("user_id", profile["id"])
            .in_("lesson_id", lesson_ids)
            .execute()
            .data
            or []
        )
        completed_ids = {row["lesson_id"] for row in progress_rows}
        current_index = next(
            index for index, row in enumerate(lesson_rows) if row["id"] == lesson_id
        )
        if any(row["id"] not in completed_ids for row in lesson_rows[:current_index]):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Bạn cần hoàn thành bài trước để mở nội dung này.",
            )

        questions = (
            supabase_admin.table("lesson_questions")
            .select("id,prompt,question_type,options,sort_order")
            .eq("lesson_id", lesson_id)
            .order("sort_order")
            .order("id")
            .execute()
            .data
            or []
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not load lesson questions.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải câu hỏi lúc này. Vui lòng thử lại.",
        ) from exc

    if not questions:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Bài học chưa có câu hỏi. Vui lòng quay lại sau.",
        )
    public_questions = []
    for question in questions:
        question.pop("sort_order", None)
        public_questions.append(
            _validate_result(
                LessonQuestionPublic,
                question,
                "Câu hỏi chưa có định dạng hợp lệ.",
            ).model_dump()
        )
    return {
        "lesson": {
            "id": lesson["id"],
            "title": lesson["title"],
            "description": lesson.get("description"),
        },
        "questions": public_questions,
    }


def submit_lesson_answer(
    profile: Dict[str, Any], question_id: int, selected_option_id: str
) -> LessonAnswerResult:
    try:
        result = supabase_admin.rpc(
            "submit_lesson_answer",
            {
                "p_user_id": profile["id"],
                "p_question_id": question_id,
                "p_selected_option_id": selected_option_id,
            },
        ).execute()
    except Exception as exc:
        raise _rpc_error(exc) from exc
    return _validate_result(
        LessonAnswerResult,
        result.data,
        "Máy chủ chưa trả về kết quả đáp án hợp lệ.",
    )


def complete_lesson(profile: Dict[str, Any], lesson_id: int) -> LessonCompletionResult:
    try:
        result = supabase_admin.rpc(
            "complete_lesson",
            {"p_user_id": profile["id"], "p_lesson_id": lesson_id},
        ).execute()
    except Exception as exc:
        raise _rpc_error(exc) from exc
    return _validate_result(
        LessonCompletionResult,
        result.data,
        "Máy chủ chưa trả về kết quả bài học hợp lệ.",
    )


def review_vocabulary_word(
    profile: Dict[str, Any], word_id: int, review_id: UUID, rating: str
) -> VocabularyWordReviewResult:
    try:
        result = supabase_admin.rpc(
            "review_vocabulary_word",
            {
                "p_user_id": profile["id"],
                "p_word_id": word_id,
                "p_review_id": str(review_id),
                "p_rating": rating,
            },
        ).execute()
    except Exception as exc:
        raise _rpc_error(exc) from exc
    return _validate_result(
        VocabularyWordReviewResult,
        result.data,
        "Máy chủ chưa trả về lịch ôn tập hợp lệ.",
    )
