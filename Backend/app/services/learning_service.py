import logging
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from jwt import PyJWTError
from pydantic import ValidationError

from app.core.config import settings
from app.db.supabase import supabase_admin
from app.schemas.learning import (
    LessonAnswerResult,
    LessonCompletionResult,
    LessonQuestionPublic,
    VocabularyWordReviewResult,
)
from app.services.ai_service import AIService
from app.services.vocabulary_service import (
    _ordered_topic_ids,
    is_premium_profile,
    is_topic_free,
)

logger = logging.getLogger(__name__)

READING_HEADERS = {
    "ja": ("BÀI ĐỌC TIẾNG NHẬT", "BẢN DỊCH TIẾNG VIỆT"),
    "en": ("BÀI ĐỌC TIẾNG ANH", "BẢN DỊCH TIẾNG VIỆT"),
    "vi": ("BÀI ĐỌC TIẾNG VIỆT", "BẢN DỊCH TIẾNG ANH"),
}


def parse_reading_description(
    description: str | None, language_code: str
) -> tuple[str, str, bool]:
    headers = READING_HEADERS.get(language_code)
    if not description:
        return "", "", False
    if not headers:
        return description, "", False
    reading_header, translation_header = headers
    marker = f"\n\n{translation_header}\n"
    if marker not in description:
        return description, "", False
    passage, translation = description.split(marker, 1)
    prefix = f"{reading_header}\n"
    if passage.startswith(prefix):
        passage = passage[len(prefix):]
    return passage, translation, bool(passage.strip())


def compose_reading_description(language_code: str, passage: str, translation: str) -> str:
    reading_header, translation_header = READING_HEADERS[language_code]
    return f"{reading_header}\n{passage}\n\n{translation_header}\n{translation}"


def _ensure_topic_access(topic_id: int, profile: Dict[str, Any]) -> None:
    if is_premium_profile(profile):
        return
    if not is_topic_free(profile["target_language"], topic_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Chủ đề này thuộc nửa sau của lộ trình — cần Premium để mở khóa.",
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
    is_premium: bool = False,
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
    # Nửa đầu chủ đề miễn phí, nửa sau cần Premium — khoá theo vị trí trong lộ trình
    free_topic_count = (len(topics) + 1) // 2
    for index, topic in enumerate(topics):
        topic_id = topic["id"]
        quiz = quiz_by_topic.get(topic_id)
        progress = progress_by_quiz.get(quiz["id"]) if quiz else None
        states[topic_id] = {
            "is_locked": index >= free_topic_count and not is_premium,
            "is_completed": topic_id in passed_topic_ids,
            "quiz_score": progress["score"] if progress else None,
            "quiz_question_count": progress["question_count"] if progress else None,
        }
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
        ordered_ids = _ordered_topic_ids(paths[0]["language_code"])
        if topic_id not in ordered_ids:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chủ đề không thuộc lộ trình này.")
        return paths[0]["language_code"], [{"id": tid} for tid in ordered_ids]
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
    language_code, ordered_topics = _path_language_and_topics(path_id, topic_id, profile)
    state = get_path_topic_states(
        path_id,
        profile["id"],
        ordered_topics,
        is_premium=is_premium_profile(profile),
    ).get(topic_id)
    if state is None or state["is_locked"]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Chủ đề này thuộc nửa sau của lộ trình — cần Premium để mở khóa.",
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
        topic_rows = (
            supabase_admin.table("topics")
            .select("language_code,readings")
            .eq("id", lesson["topic_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if topic_rows:
            stored = topic_rows[0].get("readings")
            if isinstance(stored, list) and len(stored) == 5 and stored[0].get("passage"):
                lesson["description"] = compose_reading_description(
                    topic_rows[0]["language_code"],
                    stored[0]["passage"],
                    stored[0]["translation"],
                )
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


def _topic_reading_context(topic_id: int) -> tuple[Dict[str, Any], list[Dict[str, Any]]]:
    topics = (
        supabase_admin.table("topics")
        .select("id,language_code,name")
        .eq("id", topic_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not topics:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề.")
    links = (
        supabase_admin.table("learning_path_topics")
        .select("learning_path_id")
        .eq("topic_id", topic_id)
        .execute()
        .data
        or []
    )
    path_ids = list(dict.fromkeys(link["learning_path_id"] for link in links))
    paths: list[Dict[str, Any]] = []
    if path_ids:
        paths = (
            supabase_admin.table("learning_paths")
            .select("id,name")
            .in_("id", path_ids)
            .order("id")
            .execute()
            .data
            or []
        )
    return topics[0], paths


def _topic_quiz_lessons(topic_id: int, path_ids: list[int]) -> list[Dict[str, Any]]:
    if not path_ids:
        return []
    return (
        supabase_admin.table("lessons")
        .select("id,learning_path_id,title,description")
        .eq("topic_id", topic_id)
        .eq("is_topic_quiz", True)
        .eq("is_active", True)
        .in_("learning_path_id", path_ids)
        .order("id")
        .execute()
        .data
        or []
    )


def get_topic_readings(topic_id: int) -> Dict[str, Any]:
    try:
        topics = (
            supabase_admin.table("topics")
            .select("id,language_code,name,readings")
            .eq("id", topic_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not topics:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề.")
        topic = topics[0]
        stored = topic.get("readings")
        if isinstance(stored, list) and len(stored) == 5:
            return {
                "topic_id": topic_id,
                "topic_name": topic["name"],
                "language_code": topic["language_code"],
                "source": "column",
                "readings": stored,
            }
        _, paths = _topic_reading_context(topic_id)
        lessons = _topic_quiz_lessons(topic_id, [path["id"] for path in paths])
        passage = translation = ""
        for lesson in lessons:
            passage, translation, has_reading = parse_reading_description(
                lesson.get("description"), topic["language_code"]
            )
            if has_reading:
                break
        empty = {"title": "", "passage": "", "translation": ""}
        readings = [dict(empty) for _ in range(5)]
        source = "empty"
        if passage:
            readings[0] = {
                "title": f"Bài đọc chủ đề: {topic['name']}",
                "passage": passage,
                "translation": translation,
            }
            source = "legacy"
        return {
            "topic_id": topic_id,
            "topic_name": topic["name"],
            "language_code": topic["language_code"],
            "source": source,
            "readings": readings,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not load topic readings.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải bài đọc của chủ đề lúc này. Vui lòng thử lại.",
        ) from exc


def save_topic_readings(topic_id: int, readings: list[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        topics = (
            supabase_admin.table("topics")
            .select("id")
            .eq("id", topic_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not topics:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề.")
        supabase_admin.table("topics").update({"readings": readings}).eq("id", topic_id).execute()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not save topic readings.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể lưu bài đọc lúc này. Vui lòng thử lại.",
        ) from exc
    return get_topic_readings(topic_id)


BOSS_QUESTION_COUNT = 25
BOSS_TOKEN_TTL = timedelta(hours=2)
_LANGUAGE_NAMES = {"en": "English", "ja": "Japanese", "vi": "Vietnamese"}


def _boss_word_pool(language_code: str) -> list[Dict[str, Any]]:
    topics = (
        supabase_admin.table("topics")
        .select("id")
        .eq("language_code", language_code)
        .execute()
        .data
        or []
    )
    topic_ids = [row["id"] for row in topics]
    if not topic_ids:
        return []
    links = (
        supabase_admin.table("word_topics")
        .select("word_id")
        .in_("topic_id", topic_ids)
        .execute()
        .data
        or []
    )
    word_ids = list(dict.fromkeys(row["word_id"] for row in links))
    if not word_ids:
        return []
    return (
        supabase_admin.table("words")
        .select("id,word,meaning,example_sentence,example_meaning")
        .in_("id", word_ids)
        .execute()
        .data
        or []
    )


def _decode_boss_token(profile: Dict[str, Any], quiz_token: str) -> Dict[str, Any]:
    try:
        # SUPABASE_SECRET_KEY chỉ nằm trên server nên dùng làm khóa ký phiên quiz Boss
        payload = jwt.decode(quiz_token, settings.SUPABASE_SECRET_KEY, algorithms=["HS256"])
    except PyJWTError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Phiên quiz Boss không hợp lệ hoặc đã hết hạn. Hãy mở lại bài kiểm tra.",
        ) from exc
    if payload.get("sub") != profile["id"] or not isinstance(payload.get("quiz"), list):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Phiên quiz Boss không thuộc về bạn.")
    return payload


def _public_boss_question(index: int, question: Dict[str, Any]) -> Dict[str, Any]:
    public: Dict[str, Any] = {
        "index": index,
        "question_type": question["question_type"],
        "prompt": question["prompt"],
    }
    if question["question_type"] == "multiple_choice":
        public["options"] = question["options"]
    elif question["question_type"] == "match":
        public["words"] = [pair["word"] for pair in question["pairs"]]
        public["meanings"] = random.sample(
            [pair["meaning"] for pair in question["pairs"]],
            len(question["pairs"]),
        )
    return public


def generate_boss_quiz(
    profile: Dict[str, Any], topic_id: int, path_id: int
) -> Dict[str, Any]:
    language_code = _ensure_path_topic_unlocked(path_id, topic_id, profile)
    words = _boss_word_pool(language_code)
    if len(words) < 8:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cần ít nhất 8 từ vựng trong các chủ đề của lộ trình để tạo quiz Boss.",
        )
    questions = AIService.generate_boss_quiz(
        words, _LANGUAGE_NAMES.get(language_code, language_code), BOSS_QUESTION_COUNT
    )
    quiz_token = jwt.encode(
        {
            "sub": profile["id"],
            "topic_id": topic_id,
            "path_id": path_id,
            "language": language_code,
            "quiz": questions,
            "exp": datetime.now(timezone.utc) + BOSS_TOKEN_TTL,
        },
        settings.SUPABASE_SECRET_KEY,
        algorithm="HS256",
    )
    return {
        "quiz_token": quiz_token,
        "questions": [
            _public_boss_question(index, question)
            for index, question in enumerate(questions)
        ],
        "question_count": len(questions),
        "topic_id": topic_id,
        "path_id": path_id,
    }


def _normalized_answer(value: Any) -> str:
    return " ".join(str(value or "").split()).casefold()


def _grade_boss_entry(question: Dict[str, Any], value: Any) -> tuple[bool, str]:
    kind = question["question_type"]
    if kind == "multiple_choice":
        correct = question["correct_option_id"]
        display = next(
            (option["text"] for option in question["options"] if option["id"] == correct),
            correct,
        )
        return str(value) == correct, display
    if kind == "fill_in":
        answer = question["answer"]
        return _normalized_answer(value) == _normalized_answer(answer), answer
    expected = {pair["word"]: pair["meaning"] for pair in question["pairs"]}
    provided: Dict[str, str] = {}
    if isinstance(value, dict):
        provided = {str(key): str(item) for key, item in value.items()}
    elif isinstance(value, list):
        for pair in value:
            if isinstance(pair, dict) and pair.get("word") and pair.get("meaning"):
                provided[str(pair["word"])] = str(pair["meaning"])
    display = "; ".join(f"{word} → {meaning}" for word, meaning in expected.items())
    return provided == expected, display


def grade_boss_quiz(
    profile: Dict[str, Any], quiz_token: str, answers: list[Dict[str, Any]]
) -> Dict[str, Any]:
    payload = _decode_boss_token(profile, quiz_token)
    quiz = payload["quiz"]
    if not answers:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Chưa có đáp án nào để chấm.")
    results = []
    seen: set[int] = set()
    for entry in answers:
        index = entry.get("index")
        if not isinstance(index, int) or index < 0 or index >= len(quiz) or index in seen:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Đáp án gửi lên không hợp lệ (trùng hoặc ngoài phạm vi câu hỏi).",
            )
        seen.add(index)
        question = quiz[index]
        is_correct, display = _grade_boss_entry(question, entry.get("value"))
        results.append({
            "index": index,
            "is_correct": is_correct,
            "correct_answer": display,
            "explanation": question.get("explanation", ""),
        })
    correct_count = sum(1 for row in results if row["is_correct"])
    passed = len(results) == len(quiz) and correct_count == len(quiz)
    if passed:
        _record_boss_pass(profile, payload)
    return {
        "results": results,
        "correct_count": correct_count,
        "question_count": len(quiz),
        "passed": passed,
    }


def _record_boss_pass(profile: Dict[str, Any], payload: Dict[str, Any]) -> None:
    quizzes = (
        supabase_admin.table("lessons")
        .select("id")
        .eq("learning_path_id", payload["path_id"])
        .eq("topic_id", payload["topic_id"])
        .eq("is_topic_quiz", True)
        .eq("is_active", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not quizzes:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Chủ đề chưa có bài kiểm tra chính thức để ghi nhận hoàn thành.",
        )
    try:
        supabase_admin.table("lesson_progress").upsert(
            {
                "user_id": profile["id"],
                "lesson_id": quizzes[0]["id"],
                "score": BOSS_QUESTION_COUNT,
                "question_count": BOSS_QUESTION_COUNT,
                "xp_awarded": 0,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id,lesson_id",
        ).execute()
    except Exception as exc:
        logger.exception("Could not record boss quiz pass.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể ghi nhận hoàn thành chủ đề lúc này. Vui lòng thử lại.",
        ) from exc


def boss_speak_text(profile: Dict[str, Any], quiz_token: str, index: int) -> tuple[str, str]:
    payload = _decode_boss_token(profile, quiz_token)
    quiz = payload["quiz"]
    if index < 0 or index >= len(quiz):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Câu hỏi không tồn tại.")
    question = quiz[index]
    if question["question_type"] != "fill_in":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Chỉ câu điền từ mới có giọng đọc đáp án.",
        )
    language = payload.get("language", "en")
    return question["answer"], _LANGUAGE_NAMES.get(language, "English")
