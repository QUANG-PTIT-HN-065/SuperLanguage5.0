from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ConversationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    language_code: Literal["English", "Japanese"]
    practice_mode: Literal["free-chat", "read-aloud"] = "free-chat"

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Chủ đề hội thoại không được để trống.")
        return value


class ConversationResponse(BaseModel):
    id: UUID
    title: str
    language_code: str
    practice_mode: Literal["free-chat", "read-aloud"] = "free-chat"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConversationMessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_type: Literal["user", "ai"]
    content: str
    ai_feedback: Optional[str] = None
    created_at: Optional[datetime] = None

class MessageSend(BaseModel):
    conversation_id: UUID
    user_message: str = Field(min_length=1, max_length=4000)

    @field_validator("user_message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tin nhắn không được để trống.")
        return value

class MessageResponse(BaseModel):
    conversation_id: UUID
    user_message: str
    ai_response: str
    ai_feedback: Optional[str] = None


class ReadingPromptRequest(BaseModel):
    conversation_id: UUID


class ReadingPromptContent(BaseModel):
    question: str = Field(min_length=1, max_length=280)
    sample_answer: str = Field(min_length=1, max_length=400)

    @field_validator("question", "sample_answer")
    @classmethod
    def clean_reading_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Câu hỏi và câu trả lời mẫu không được để trống.")
        return value


class ReadingFeedback(BaseModel):
    grammar_error: str = Field(max_length=500)
    corrected_sentence: str = Field(max_length=4000)
    natural_suggestion: str = Field(max_length=500)
    pronunciation_score: Optional[int] = Field(default=None, ge=0, le=100)
    pronunciation_feedback: str = Field(default="", max_length=1000)


class ReadingPromptResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    question: str
    sample_answer: str
    created_at: Optional[datetime] = None


class ReadingPracticeTurnResponse(ReadingPromptResponse):
    transcript: Optional[str] = None
    ai_feedback: Optional[ReadingFeedback] = None


class AudioUploadResponse(BaseModel):
    conversation_id: UUID
    file_name: str
    content_type: str
    size_bytes: int
    storage_path: str


class AudioTranscriptionResponse(BaseModel):
    transcript: str


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    language: Literal["English", "Japanese", "Vietnamese"]

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Văn bản cần đọc không được để trống.")
        return value