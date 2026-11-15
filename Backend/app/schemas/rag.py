from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RAGDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=150)
    language_code: Literal["English", "Japanese", "all"]
    content: str = Field(min_length=1, max_length=20_000)

    @field_validator("title", "content")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Giá trị không được để trống.")
        return value


class RAGDocumentResponse(BaseModel):
    title: str
    language_code: str
    chunks_indexed: int


class RAGDocumentSummary(BaseModel):
    document_key: str
    title: str
    language_code: str
    content: str
    chunks_count: int
    created_at: str | None = None
