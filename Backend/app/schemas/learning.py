from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


ReviewRating = Literal["Khó", "Tốt", "Dễ"]


class LessonAnswerSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selected_option_id: str = Field(min_length=1, max_length=200)

    @field_validator("selected_option_id")
    @classmethod
    def clean_option_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Vui lòng chọn một đáp án.")
        return cleaned


class LessonAnswerResult(BaseModel):
    question_id: int
    selected_option_id: str
    is_correct: bool
    correct_option_id: str
    explanation: str | None = None
    already_checked: bool


class LessonCompletionResult(BaseModel):
    lesson_id: int
    score: int
    question_count: int
    passed: bool
    xp_awarded: int
    xp_total: int
    level: int
    xp_into_level: int
    current_streak: int
    already_completed: bool


class VocabularyWordReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_id: UUID
    rating: ReviewRating


class VocabularyWordReviewResult(BaseModel):
    word_id: int
    review_id: UUID
    rating: ReviewRating
    mastery_level: int
    review_count: int
    last_reviewed_at: str
    next_review_at: str
    already_applied: bool


class LessonQuestionPublic(BaseModel):
    id: int
    prompt: str
    question_type: Literal["multiple_choice", "fill_in"] = "multiple_choice"
    options: list[dict[str, Any]]
