import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status

from app.db.supabase import supabase_admin
from app.schemas.dashboard import (
    DailyQuest,
    LearnerDashboard,
    StreakDay,
    WeeklyLeaderboardEntry,
)

logger = logging.getLogger(__name__)
WORDS_DAILY_TARGET = 10
QUIZ_PASS_PERCENT = 95


def _profile_timezone(profile: Dict[str, Any]) -> ZoneInfo | timezone:
    timezone_name = profile.get("timezone")
    try:
        return ZoneInfo(timezone_name) # type: ignore
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        logger.warning(
            "Timezone %r is unavailable; using UTC for dashboard dates.",
            timezone_name,
        )
        return timezone.utc


def _required_count(value: Any, field: str, *, minimum: int = 0) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Cơ sở dữ liệu trả về {field} không hợp lệ.",
        ) from exc
    if count < minimum:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Cơ sở dữ liệu trả về {field} không hợp lệ.",
        )
    return count


def get_learner_dashboard(profile: Dict[str, Any]) -> LearnerDashboard:
    user_id = str(profile["id"])
    user_timezone = _profile_timezone(profile)
    today = datetime.now(user_timezone).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    day_start = datetime.combine(today, time.min, tzinfo=user_timezone)
    next_day_start = day_start + timedelta(days=1)

    try:
        activity_rows = (
            supabase_admin.table("daily_activity")
            .select("activity_date,xp_earned,lessons_completed")
            .eq("user_id", user_id)
            .gte("activity_date", week_start.isoformat())
            .lte("activity_date", week_end.isoformat())
            .execute()
            .data
            or []
        )
        review_rows = (
            supabase_admin.table("user_word_review_events")
            .select("word_id")
            .eq("user_id", user_id)
            .gte("last_reviewed_at", day_start.isoformat())
            .lt("last_reviewed_at", next_day_start.isoformat())
            .execute()
            .data
            or []
        )
        quiz_rows = (
            supabase_admin.table("lesson_progress")
            .select("score,question_count")
            .eq("user_id", user_id)
            .gte("completed_at", day_start.isoformat())
            .lt("completed_at", next_day_start.isoformat())
            .execute()
            .data
            or []
        )
        leaderboard_rows = (
            supabase_admin.table("leaderboard_weekly")
            .select("rank,username,display_name,avatar_url,xp_week,user_id")
            .order("rank")
            .limit(10)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.exception("Could not load learner dashboard data.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải dữ liệu trang chủ từ cơ sở dữ liệu. Vui lòng thử lại.",
        ) from exc

    activities_by_date = {
        str(row["activity_date"]): row # type: ignore
        for row in activity_rows
        if row.get("activity_date") is not None # type: ignore
    }
    today_activity = activities_by_date.get(today.isoformat(), {})
    lessons_target = _required_count(
        profile.get("daily_goal_lessons"), "mục tiêu bài học", minimum=1
    )
    lessons_progress = _required_count(
        today_activity.get("lessons_completed", 0), "số bài học hôm nay" # type: ignore
    )
    reviewed_word_ids = {
        _required_count(row.get("word_id"), "mã từ vựng", minimum=1) # type: ignore
        for row in review_rows
    }
    successful_quiz = any(
        _required_count(row.get("question_count"), "số câu hỏi", minimum=1) # type: ignore
        and _required_count(row.get("score"), "điểm bài kiểm tra") # type: ignore
        * 100
        >= QUIZ_PASS_PERCENT
        * _required_count(row.get("question_count"), "số câu hỏi", minimum=1) # type: ignore
        for row in quiz_rows
    )

    daily_quests = [
        DailyQuest(
            id="lessons",
            title=f"Hoàn thành {lessons_target} bài học",
            progress=lessons_progress,
            target=lessons_target,
            unit="bài",
            completed=lessons_progress >= lessons_target,
        ),
        DailyQuest(
            id="words",
            title=f"Ôn {WORDS_DAILY_TARGET} từ vựng",
            progress=len(reviewed_word_ids),
            target=WORDS_DAILY_TARGET,
            unit="từ",
            completed=len(reviewed_word_ids) >= WORDS_DAILY_TARGET,
        ),
        DailyQuest(
            id="quiz",
            title=f"Đạt ít nhất {QUIZ_PASS_PERCENT}% trong một bài kiểm tra",
            progress=int(successful_quiz),
            target=1,
            unit="bài",
            completed=successful_quiz,
        ),
    ]

    streak_week = []
    for day_offset in range(7):
        current_date = week_start + timedelta(days=day_offset)
        activity = activities_by_date.get(current_date.isoformat(), {})
        xp_earned = _required_count(activity.get("xp_earned", 0), "XP trong ngày") # type: ignore
        lessons_completed = _required_count(
            activity.get("lessons_completed", 0), "số bài học trong ngày" # type: ignore
        )
        streak_week.append(
            StreakDay(
                date=current_date,
                studied=xp_earned > 0 or lessons_completed > 0,
            )
        )

    weekly_leaderboard = []
    for row in leaderboard_rows:
        username = row.get("username") # type: ignore
        if not isinstance(username, str) or not username:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Cơ sở dữ liệu trả về người dùng xếp hạng không hợp lệ.",
            )
        display_name = row.get("display_name") or username # type: ignore
        if not isinstance(display_name, str):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Cơ sở dữ liệu trả về tên hiển thị không hợp lệ.",
            )
        weekly_leaderboard.append(
            WeeklyLeaderboardEntry(
                rank=_required_count(row.get("rank"), "thứ hạng", minimum=1), # type: ignore
                username=username,
                display_name=display_name,
                avatar_url=row.get("avatar_url"), # type: ignore
                xp_week=_required_count(row.get("xp_week"), "XP tuần"), # type: ignore
                is_current_user=str(row.get("user_id")) == user_id, # type: ignore
            )
        )

    return LearnerDashboard(
        week_start=week_start,
        daily_quests=daily_quests,
        weekly_leaderboard=weekly_leaderboard,
        streak_week=streak_week,
    )
