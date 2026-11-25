import logging
import random
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
QUEST_COUNT = 3

# Kho nhiệm vụ hằng ngày gắn với các chức năng của hệ thống.
# Mỗi người dùng mỗi ngày random lấy QUEST_COUNT nhiệm vụ (seed = user_id + ngày
# trong timezone của họ) nên kết quả ổn định khi tải lại nhưng đổi theo ngày.
# metric: khóa tiến độ do get_learner_dashboard tính từ các bảng có sẵn.
# Chỉ nhận những nhiệm vụ tiến độ tăng được NGAY TRONG NGÀY: nhiệm vụ chuỗi ngày
# (streak) chỉ nhảy số khi sang ngày mới nên người học không bao giờ làm xong
# đúng ngày nó được rút (vd "Duy trì chuỗi học ít nhất 3 ngày" hiện 1/3).
QUEST_POOL: tuple[Dict[str, Any], ...] = (
    {"id": "lesson_1", "title": "Hoàn thành 1 bài học", "metric": "lessons", "target": 1, "unit": "bài"},
    {"id": "lesson_2", "title": "Hoàn thành 2 bài học", "metric": "lessons", "target": 2, "unit": "bài"},
    {"id": "lesson_goal", "title": "Đạt mục tiêu bài học trong ngày", "metric": "lessons", "target": 0, "unit": "bài"},
    {"id": "xp_30", "title": "Kiếm 30 EXP hôm nay", "metric": "xp", "target": 30, "unit": "EXP"},
    {"id": "xp_60", "title": "Kiếm 60 EXP hôm nay", "metric": "xp", "target": 60, "unit": "EXP"},
    {"id": "xp_100", "title": "Kiếm 100 EXP hôm nay", "metric": "xp", "target": 100, "unit": "EXP"},
    {"id": "quiz_95", "title": "Đạt ít nhất 95% trong một bài kiểm tra", "metric": "quiz95", "target": 1, "unit": "bài"},
    {"id": "quiz_perfect", "title": "Đạt điểm tuyệt đối trong một bài kiểm tra", "metric": "quizPerfect", "target": 1, "unit": "bài"},
    {"id": "quiz_two", "title": "Làm 2 bài kiểm tra hôm nay", "metric": "quizCount", "target": 2, "unit": "bài"},
    {"id": "quiz_20q", "title": "Trả lời 20 câu hỏi kiểm tra hôm nay", "metric": "quizQuestions", "target": 20, "unit": "câu"},
    {"id": "quiz_80_two", "title": "Đạt ít nhất 80% ở 2 bài kiểm tra", "metric": "quiz80", "target": 2, "unit": "bài"},
    {"id": "review_5", "title": "Ôn 5 từ vựng", "metric": "reviewWords", "target": 5, "unit": "từ"},
    {"id": "review_10", "title": "Ôn 10 từ vựng", "metric": "reviewWords", "target": 10, "unit": "từ"},
    {"id": "review_20", "title": "Ôn 20 từ vựng", "metric": "reviewWords", "target": 20, "unit": "từ"},
    {"id": "review_good_10", "title": "Ôn 10 từ vựng được đánh giá Tốt hoặc Dễ", "metric": "reviewGoodWords", "target": 10, "unit": "từ"},
    {"id": "learn_5", "title": "Học 5 từ mới", "metric": "newWords", "target": 5, "unit": "từ"},
    {"id": "learn_10", "title": "Học 10 từ mới", "metric": "newWords", "target": 10, "unit": "từ"},
    {"id": "session_1", "title": "Hoàn thành 1 phiên ôn tập từ vựng", "metric": "reviewSessions", "target": 1, "unit": "phiên"},
    {"id": "session_50", "title": "Ôn 50 từ trong một phiên ôn tập", "metric": "sessionMax", "target": 50, "unit": "từ"},
    {"id": "chat_new", "title": "Bắt đầu một cuộc trò chuyện mới với AI", "metric": "newChats", "target": 1, "unit": "cuộc"},
    {"id": "chat_10", "title": "Gửi 10 tin nhắn trong các cuộc trò chuyện với AI", "metric": "chatMsgs", "target": 10, "unit": "tin"},
    {"id": "chat_voice_5", "title": "Luyện nói: gửi 5 tin nhắn giọng nói cho AI", "metric": "voiceMsgs", "target": 5, "unit": "tin"},
    {"id": "chat_feedback_5", "title": "Nhận 5 lượt AI sửa lỗi trong trò chuyện", "metric": "feedbackMsgs", "target": 5, "unit": "lượt"},
    {"id": "reading_3", "title": "Luyện đọc hiểu 3 lượt với AI", "metric": "readingTurns", "target": 3, "unit": "lượt"},
    {"id": "shop_1", "title": "Mua hoặc đổi 1 vật phẩm trong cửa hàng", "metric": "shopTx", "target": 1, "unit": "món"},
    {"id": "boost_1", "title": "Dùng 1 vật phẩm hỗ trợ trong lúc học", "metric": "boostUses", "target": 1, "unit": "lượt"},
)


def build_quest_rows(metrics: Dict[str, int], lessons_target: int) -> Dict[str, DailyQuest]:
    rows: Dict[str, DailyQuest] = {}
    for quest in QUEST_POOL:
        target = lessons_target if quest["id"] == "lesson_goal" else quest["target"]
        progress = metrics.get(quest["metric"], 0)
        rows[quest["id"]] = DailyQuest(
            id=quest["id"],
            title=quest["title"],
            progress=progress,
            target=target,
            unit=quest["unit"],
            completed=progress >= target,
        )
    return rows


def select_daily_quests(
    user_id: str,
    day: date,
    metrics: Dict[str, int],
    lessons_target: int,
    count: int = QUEST_COUNT,
) -> list[DailyQuest]:
    rows = build_quest_rows(metrics, lessons_target)
    rng = random.Random(f"{user_id}:{day.isoformat()}")
    picked = rng.sample(sorted(rows), min(count, len(rows)))
    return [rows[quest_id] for quest_id in picked]


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


def _quest_rows(label: str, fetch) -> list:
    """Nguồn tiến độ nhiệm vụ PHỤ: thiếu bảng/cột (vd chưa import migration) chỉ tính 0,
    không được làm sập cả dashboard."""
    try:
        return fetch() or []
    except Exception as exc:
        logger.warning(
            "Quest data source %s unavailable (%s); counting as zero.",
            label,
            type(exc).__name__,
        )
        return []


def _in_day(value: Any, day_start: datetime, next_day_start: datetime) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return day_start <= moment < next_day_start


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
            .select("word_id,rating")
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

    conversation_rows = _quest_rows(
        "conversations",
        lambda: supabase_admin.table("conversations")
        .select("id,created_at")
        .eq("user_id", user_id)
        .execute()
        .data,
    )
    conversation_ids = [
        str(row["id"]) for row in conversation_rows if row.get("id") is not None
    ]
    message_rows = []
    reading_rows = []
    if conversation_ids:
        message_rows = _quest_rows(
            "messages",
            lambda: supabase_admin.table("messages")
            .select("sender_type,audio_url,ai_feedback")
            .in_("conversation_id", conversation_ids)
            .gte("created_at", day_start.isoformat())
            .lt("created_at", next_day_start.isoformat())
            .execute()
            .data,
        )
        reading_rows = _quest_rows(
            "reading_practice_turns",
            lambda: supabase_admin.table("reading_practice_turns")
            .select("id")
            .in_("conversation_id", conversation_ids)
            .gte("created_at", day_start.isoformat())
            .lt("created_at", next_day_start.isoformat())
            .execute()
            .data,
        )
    new_word_rows = _quest_rows(
        "user_words",
        lambda: supabase_admin.table("user_words")
        .select("word_id")
        .eq("user_id", user_id)
        .gte("created_at", day_start.isoformat())
        .lt("created_at", next_day_start.isoformat())
        .execute()
        .data,
    )
    session_rows = _quest_rows(
        "vocabulary_review_sessions",
        lambda: supabase_admin.table("vocabulary_review_sessions")
        .select("reviewed_count")
        .eq("user_id", user_id)
        .gte("completed_at", day_start.isoformat())
        .lt("completed_at", next_day_start.isoformat())
        .execute()
        .data,
    )
    shop_rows = _quest_rows(
        "shop_transactions",
        lambda: supabase_admin.table("shop_transactions")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", day_start.isoformat())
        .lt("created_at", next_day_start.isoformat())
        .execute()
        .data,
    )
    boost_rows = _quest_rows(
        "shop_item_usages",
        lambda: supabase_admin.table("shop_item_usages")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", day_start.isoformat())
        .lt("created_at", next_day_start.isoformat())
        .execute()
        .data,
    )
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

    def _percent(row: Dict[str, Any]) -> float:
        questions = _required_count(row.get("question_count"), "số câu hỏi", minimum=1)
        return _required_count(row.get("score"), "điểm bài kiểm tra") * 100 / questions

    user_messages = [
        row for row in message_rows if row.get("sender_type") == "user"
    ]
    metrics = {
        "lessons": lessons_progress,
        "xp": _required_count(today_activity.get("xp_earned", 0), "XP hôm nay"),
        "quiz95": int(successful_quiz),
        "quizPerfect": int(any(_percent(row) >= 100 for row in quiz_rows)),
        "quizCount": len(quiz_rows),
        "quizQuestions": sum(
            _required_count(row.get("question_count"), "số câu hỏi", minimum=1)
            for row in quiz_rows
        ),
        "quiz80": sum(1 for row in quiz_rows if _percent(row) >= 80),
        "reviewWords": len(reviewed_word_ids),
        "reviewGoodWords": len(
            {
                _required_count(row.get("word_id"), "mã từ vựng", minimum=1)
                for row in review_rows
                if row.get("rating") in {"Tốt", "Dễ"}
            }
        ),
        "newWords": len(new_word_rows),
        "reviewSessions": len(session_rows),
        "sessionMax": max(
            (_required_count(row.get("reviewed_count"), "số từ đã ôn", minimum=0)
             for row in session_rows),
            default=0,
        ),
        "newChats": sum(
            1
            for row in conversation_rows
            if _in_day(row.get("created_at"), day_start, next_day_start)
        ),
        "chatMsgs": len(user_messages),
        "voiceMsgs": sum(1 for row in user_messages if row.get("audio_url")),
        "feedbackMsgs": sum(1 for row in message_rows if row.get("ai_feedback")),
        "readingTurns": len(reading_rows),
        "shopTx": len(shop_rows),
        "boostUses": len(boost_rows),
    }

    daily_quests = select_daily_quests(user_id, today, metrics, lessons_target)

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
