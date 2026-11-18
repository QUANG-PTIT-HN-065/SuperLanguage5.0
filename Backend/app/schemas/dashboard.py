from datetime import date
from typing import Literal

from pydantic import BaseModel


class DailyQuest(BaseModel):
    id: Literal["lessons", "words", "quiz"]
    title: str
    progress: int
    target: int
    unit: str
    completed: bool


class WeeklyLeaderboardEntry(BaseModel):
    rank: int
    username: str
    display_name: str
    avatar_url: str | None = None
    xp_week: int
    is_current_user: bool


class StreakDay(BaseModel):
    date: date
    studied: bool


class LearnerDashboard(BaseModel):
    week_start: date
    daily_quests: list[DailyQuest]
    weekly_leaderboard: list[WeeklyLeaderboardEntry]
    streak_week: list[StreakDay]
