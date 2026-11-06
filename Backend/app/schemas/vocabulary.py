from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.profile import LANG_PATTERN, Level

PartOfSpeech = Literal["noun", "verb", "adjective", "adverb", "phrase", "other"]


class WordCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language_code: str = Field(pattern=LANG_PATTERN)
    word: str = Field(min_length=1, max_length=150)
    meaning: str = Field(min_length=1, max_length=500)
    phonetic: Optional[str] = Field(default=None, max_length=100)
    part_of_speech: Optional[PartOfSpeech] = None
    audio_url: Optional[str] = Field(default=None, max_length=500, pattern=r"^https://")
    example_sentence: Optional[str] = Field(default=None, max_length=1000)
    example_meaning: Optional[str] = Field(default=None, max_length=1000)
    level: Level = "A1"
    topic_ids: list[int] = Field(min_length=1, max_length=20)

    @field_validator("word", "meaning", "phonetic", "example_sentence", "example_meaning")
    @classmethod
    def strip_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Trường này không được để trống.")
        return value

    @field_validator("topic_ids")
    @classmethod
    def unique_topic_ids(cls, values: list[int]) -> list[int]:
        if any(topic_id < 1 for topic_id in values):
            raise ValueError("topic_ids phải là số nguyên dương.")
        if len(set(values)) != len(values):
            raise ValueError("topic_ids không được chứa giá trị trùng lặp.")
        return values
