from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


LeaderboardPeriod = Literal["today", "week", "month", "all"]
LeaderboardSort = Literal["xp", "streak", "lessons", "accuracy"]
LeaderboardLanguage = Literal["all", "en", "ja", "vi"]


class LeaderboardEntry(BaseModel):
    rank: int = Field(ge=1)
    user_id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    target_language: str
    xp: int = Field(ge=0)
    current_streak: int = Field(ge=0)
    lessons_completed: int = Field(ge=0)
    accuracy: float = Field(ge=0, le=100)
    is_current_user: bool


class LeaderboardCurrentUser(BaseModel):
    rank: int = Field(ge=1)
    xp: int = Field(ge=0)


class LeaderboardResult(BaseModel):
    items: list[LeaderboardEntry]
    total: int = Field(ge=0)
    current_user: LeaderboardCurrentUser | None
    period: LeaderboardPeriod
    as_of: date
