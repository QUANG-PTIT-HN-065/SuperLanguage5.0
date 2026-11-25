from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import requests

from fastapi import HTTPException, status
from app.db.supabase import supabase_admin
from app.core.config import settings
from app.services.profile_service import raise_db_error


def get_admin_overview_stats() -> Dict[str, Any]:
    """Lấy dữ liệu thống kê tổng hợp thực tế từ các bảng Supabase."""
    try:
        # 1. Đếm tổng số học viên
        profiles_res = supabase_admin.table("profiles").select("id, target_language, role, status, plan_id", count="exact").execute()# type: ignore
        total_students = profiles_res.count or len(profiles_res.data or [])

        # 2. Đếm tổng số từ vựng
        words_res = supabase_admin.table("words").select("id", count="exact").execute() # type: ignore
        total_words = words_res.count or len(words_res.data or [])

        # 3. Đếm tổng số chủ đề
        topics_res = supabase_admin.table("topics").select("id, language_code", count="exact").execute()# type: ignore
        total_topics = topics_res.count or len(topics_res.data or [])

        # 4. Tính toán tổng XP và thống kê streak
        stats_res = supabase_admin.table("user_stats").select("xp_total, words_learned, current_streak, longest_streak").execute()
        user_stats_data = stats_res.data or []
        total_xp = sum(item.get("xp_total", 0) for item in user_stats_data) # type: ignore
        max_streak = max((item.get("longest_streak", 0) for item in user_stats_data), default=0) # type: ignore

        # 5. Phân bổ ngôn ngữ học tập
        lang_distribution: Dict[str, int] = {}
        for p in profiles_res.data or []:
            lang = p.get("target_language") or "en" # type: ignore
            lang_distribution[lang] = lang_distribution.get(lang, 0) + 1 # type: ignore

        # 6. Dữ liệu 7 ngày gần nhất cho biểu đồ
        today = datetime.now(timezone.utc).date()
        week_start = today - timedelta(days=6)
        date_labels: List[str] = [
            (week_start + timedelta(days=offset)).isoformat()
            for offset in range(7)
        ]

        activity_res = (
            supabase_admin.table("daily_activity")
            .select("activity_date,user_id,lessons_completed,goal_met")
            .gte("activity_date", week_start.isoformat())
            .lte("activity_date", today.isoformat())
            .execute()
        )
        activity_rows = activity_res.data or []

        review_res = (
            supabase_admin.table("user_word_review_events")
            .select("last_reviewed_at")
            .gte("last_reviewed_at", datetime.combine(week_start, datetime.min.time(), timezone.utc).isoformat())
            .lte("last_reviewed_at", datetime.combine(today + timedelta(days=1), datetime.min.time(), timezone.utc).isoformat())
            .execute()
        )
        review_rows = review_res.data or []

        lesson_res = (
            supabase_admin.table("lesson_progress")
            .select("score,question_count")
            .gte("completed_at", datetime.combine(week_start, datetime.min.time(), timezone.utc).isoformat())
            .lte("completed_at", datetime.combine(today + timedelta(days=1), datetime.min.time(), timezone.utc).isoformat())
            .execute()
        )
        lesson_rows = lesson_res.data or []

        active_by_date: Dict[str, set[str]] = {day: set() for day in date_labels}
        lessons_by_date: Dict[str, int] = {day: 0 for day in date_labels}
        goal_met_total = 0
        for row in activity_rows:
            day = str(row.get("activity_date") or "") # type: ignore
            if day in active_by_date:
                user_id = str(row.get("user_id") or "") # type: ignore
                if user_id:
                    active_by_date[day].add(user_id)
                lessons_by_date[day] += int(row.get("lessons_completed") or 0) # type: ignore
            if row.get("goal_met") is True: # type: ignore
                goal_met_total += 1

        reviews_by_date: Dict[str, int] = {day: 0 for day in date_labels}
        for row in review_rows:
            reviewed_at = str(row.get("last_reviewed_at") or "") # type: ignore
            day = reviewed_at[:10]
            if day in reviews_by_date:
                reviews_by_date[day] += 1

        goal_total = len([row for row in activity_rows if row.get("activity_date") in date_labels]) # type: ignore
        goal_percentage = round(goal_met_total * 100 / goal_total, 1) if goal_total else 0

        total_score = sum(int(row.get("score") or 0) for row in lesson_rows) # type: ignore
        total_questions = sum(int(row.get("question_count") or 0) for row in lesson_rows) # type: ignore
        lesson_accuracy = round(total_score * 100 / total_questions, 1) if total_questions else 0

        return {
            "total_students": total_students,
            "total_words": total_words,
            "total_topics": total_topics,
            "total_xp": total_xp,
            "max_streak": max_streak,
            "language_distribution": lang_distribution,
            "engagement": {
                "date_labels": date_labels,
                "active_users": [len(active_by_date[day]) for day in date_labels],
                "lessons_completed": [lessons_by_date[day] for day in date_labels],
                "vocabulary_reviews": [reviews_by_date[day] for day in date_labels],
            },
            "goal_met_percentage": goal_percentage,
            "lesson_accuracy": lesson_accuracy,
        }
    except Exception as exc:
        raise_db_error(exc)
        return {}


def list_admin_topics_full(language_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lấy danh sách chủ đề và đếm số từ vựng liên kết thực tế."""
    try:
        query = supabase_admin.table("topics").select("id, language_code, name, description, icon_url, sort_order")
        if language_code and language_code != "all":
            query = query.eq("language_code", language_code)
        
        topics = query.order("sort_order").execute().data or []

        # Lấy số từ vựng cho từng chủ đề qua bảng word_topics
        topic_ids = [t["id"] for t in topics] # type: ignore
        word_count_map: Dict[int, int] = {}
        if topic_ids:
            wt_res = supabase_admin.table("word_topics").select("topic_id").in_("topic_id", topic_ids).execute()# type: ignore
            for row in wt_res.data or []:
                tid = row["topic_id"] # type: ignore
                word_count_map[tid] = word_count_map.get(tid, 0) + 1 # type: ignore

        for t in topics:
            t["word_count"] = word_count_map.get(t["id"], 0) # type: ignore

        return topics # type: ignore
    except Exception as exc:
        raise_db_error(exc)
        return []


def create_admin_topic(data: Dict[str, Any]) -> Dict[str, Any]:
    """Tạo chủ đề mới trong CSDL."""
    try:
        res = supabase_admin.table("topics").insert({
            "language_code": data["language_code"],
            "name": data["name"],
            "description": data.get("description"),
            "icon_url": data.get("icon_url") or "category",
            "sort_order": data.get("sort_order", 100),
        }).execute()

        if not res.data:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tạo chủ đề.")
        return res.data[0]# type: ignore
    except Exception as exc:
        raise_db_error(exc)
        raise


def update_admin_topic(topic_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    """Cập nhật thông tin chủ đề theo ID."""
    clean_data = {k: v for k, v in data.items() if v is not None}
    if not clean_data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không có trường nào được gửi để cập nhật.")

    try:
        res = supabase_admin.table("topics").update(clean_data).eq("id", topic_id).execute()
        if not res.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề.")
        return res.data[0]# type: ignore
    except Exception as exc:
        raise_db_error(exc)
        raise


def delete_admin_topic(topic_id: int) -> None:
    """Xóa một chủ đề khỏi hệ thống."""
    try:
        res = supabase_admin.table("topics").delete().eq("id", topic_id).execute()
        if not res.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy chủ đề cần xóa.")
    except Exception as exc:
        raise_db_error(exc)


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except (TypeError, ValueError):
        return None


def _last_activity(profile: Dict[str, Any], stats: Dict[str, Any]) -> Optional[datetime]:
    candidates = [
        _parse_datetime(profile.get("last_sign_in_at")),
        _parse_datetime(stats.get("last_activity_date")),
        _parse_datetime(profile.get("updated_at")),
        _parse_datetime(profile.get("created_at")),
    ]
    candidates = [item for item in candidates if item is not None]
    return max(candidates) if candidates else None


def list_admin_users(
    limit: int = 50,
    offset: int = 0,
    search_term: Optional[str] = None,
    status_filter: Optional[str] = None,
    inactive_only: bool = False,
) -> Dict[str, Any]:
    """Lọc, tìm kiếm và phân trang tài khoản người dùng."""
    try:
        query = (
            supabase_admin.table("profiles")
            .select(
                "id, email, username, display_name, role, status, plan_id, "
                "target_language, current_level, created_at, updated_at, last_sign_in_at",
                count="exact", # type: ignore
            )
            .is_("deleted_at", "null")
        )
        if status_filter in ("active", "suspended"):
            query = query.eq("status", status_filter)

        profiles = query.order("created_at", desc=True).range(0, 4999).execute().data or []

        search = (search_term or "").strip().lower()
        if search:
            profiles = [
                p for p in profiles
                if search in str(p.get("email") or "").lower() # type: ignore
                or search in str(p.get("username") or "").lower() # type: ignore
                or search in str(p.get("display_name") or "").lower() # type: ignore
            ]

        user_ids = [p["id"] for p in profiles] # type: ignore
        stats_map: Dict[str, Dict[str, Any]] = {}
        if user_ids:
            stats_res = (
                supabase_admin.table("user_stats")
                .select("user_id, xp_total, current_streak, longest_streak, words_learned, last_activity_date")
                .in_("user_id", user_ids) # type: ignore
                .execute()
            )
            for s in stats_res.data or []:
                stats_map[s["user_id"]] = s # type: ignore

        cutoff = datetime.now(timezone.utc) - timedelta(days=730)
        filtered: List[Dict[str, Any]] = []
        for profile in profiles:
            stats = stats_map.get(profile["id"], {}) # type: ignore
            last_activity = _last_activity(profile, stats)  # type: ignore
            inactive_days = max(0, (datetime.now(timezone.utc) - last_activity).days) if last_activity else None
            profile["xp_total"] = stats.get("xp_total", 0) # type: ignore
            profile["current_streak"] = stats.get("current_streak", 0) # type: ignore
            profile["words_learned"] = stats.get("words_learned", 0) # type: ignore
            profile["last_activity_at"] = last_activity.isoformat() if last_activity else None # type: ignore
            profile["inactive_days"] = inactive_days # type: ignore
            profile["inactive_over_24_months"] = bool(last_activity and last_activity < cutoff) # type: ignore

            if inactive_only and not profile["inactive_over_24_months"]: # type: ignore
                continue
            if status_filter == "inactive" and not profile["inactive_over_24_months"]: # type: ignore
                continue
            if status_filter == "active" and (profile["status"] != "active" or profile["inactive_over_24_months"]): # type: ignore
                continue
            filtered.append(profile) # type: ignore

        total = len(filtered)
        paged = filtered[offset:offset + limit]
        return {"items": paged, "total": total, "limit": limit, "offset": offset}
    except Exception as exc:
        raise_db_error(exc)
        return {"items": [], "total": 0, "limit": limit, "offset": offset}


def set_admin_user_status(user_id: str, action: str) -> Dict[str, Any]:
    if action not in ("lock", "unlock"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Hành động không hợp lệ.")

    new_status = "suspended" if action == "lock" else "active"
    try:
        profile_res = (
            supabase_admin.table("profiles")
            .update({"status": new_status})
            .eq("id", user_id)
            .execute()
        )
        if not profile_res.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản.")

        try:
            supabase_admin.auth.admin.update_user_by_id(
                user_id,
                {"ban_duration": "876000h" if action == "lock" else "none"},
            )
        except Exception:
            if action == "lock":
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    "Đã cập nhật hồ sơ nhưng không thể khóa phiên đăng nhập trong Supabase Auth.",
                )

        return profile_res.data[0] # type: ignore
    except HTTPException:
        raise
    except Exception as exc:
        raise_db_error(exc)
        raise


def delete_admin_user(user_id: str) -> None:
    try:
        supabase_admin.auth.admin.delete_user(user_id)
    except Exception as exc:
        raise_db_error(exc)


def _send_inactivity_warning(email: str, display_name: str) -> bool:
    if not settings.RESEND_API_KEY or not email:
        return False
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": "SuperLanguage <onboarding@resend.dev>",
                "to": [email],
                "subject": "Cảnh báo: tài khoản SuperLanguage sẽ bị xóa",
                "html": (
                    f"<p>Xin chào {display_name or email},</p>"
                    "<p>Tài khoản của bạn đã không hoạt động ít nhất 24 tháng. "
                    "Tài khoản và toàn bộ dữ liệu liên quan sẽ được xóa sau 7 ngày nếu bạn không đăng nhập lại.</p>"
                    "<p>Hãy đăng nhập vào SuperLanguage để giữ tài khoản.</p>"
                ),
            },
            timeout=15,
        )
        return response.status_code in (200, 201)
    except requests.RequestException:
        return False


def _inactive_profiles() -> List[Dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=730)
    result = (
        supabase_admin.table("profiles")
        .select(
            "id, email, username, display_name, status, created_at, updated_at, "
            "last_sign_in_at"
        )
        .is_("deleted_at", "null")
        .range(0, 4999)
        .execute()
    )
    profiles = result.data or []
    user_ids = [p["id"] for p in profiles] # type: ignore
    stats_map: Dict[str, Dict[str, Any]] = {}
    if user_ids:
        stats_res = (
            supabase_admin.table("user_stats")
            .select("user_id, last_activity_date")
            .in_("user_id", user_ids) # type: ignore
            .execute()
        )
        stats_map = {row["user_id"]: row for row in (stats_res.data or [])} # type: ignore

    inactive: List[Dict[str, Any]] = []
    for profile in profiles:
        last_activity = _last_activity(profile, stats_map.get(profile["id"], {})) # type: ignore
        if last_activity and last_activity < cutoff:
            profile["_last_activity"] = last_activity # type: ignore
            inactive.append(profile) # type: ignore
    return inactive


def schedule_inactive_account_deletions() -> Dict[str, Any]:
    """Gửi mail cảnh báo và lên lịch xóa sau 7 ngày."""
    now = datetime.now(timezone.utc)
    scheduled_at = now + timedelta(days=7)
    warned = 0
    eligible = 0
    for profile in _inactive_profiles():
        eligible += 1
        email_sent = _send_inactivity_warning(
            profile.get("email") or "",
            profile.get("display_name") or profile.get("username") or "",
        )
        try:
            supabase_admin.table("profiles").update({
                "deletion_warning_at": now.isoformat(),
                "deletion_scheduled_at": scheduled_at.isoformat(),
            }).eq("id", profile["id"]).execute()
        except Exception as exc:
            text = str(exc).lower()
            if "deletion_warning_at" in text or "deletion_scheduled_at" in text:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Chưa áp dụng migration 16_account_lifecycle.sql trên Supabase.",
                ) from exc
            raise_db_error(exc)
        if email_sent:
            warned += 1
    return {
        "eligible_accounts": eligible,
        "warning_emails_sent": warned,
        "scheduled_for": scheduled_at.isoformat(),
    }


def process_inactive_account_deletions() -> Dict[str, Any]:
    """Xóa tài khoản đã hết 7 ngày cảnh báo và vẫn không hoạt động."""
    now = datetime.now(timezone.utc)
    try:
        result = (
            supabase_admin.table("profiles")
            .select("id")
            .is_("deleted_at", "null")
            .lte("deletion_scheduled_at", now.isoformat())
            .execute()
        )
    except Exception as exc:
        text = str(exc).lower()
        if "deletion_scheduled_at" in text:
            return {"deleted_accounts": 0}
        raise_db_error(exc)
    deleted = 0
    for profile in result.data or []:
        full = (
            supabase_admin.table("profiles")
            .select("id, last_sign_in_at, updated_at, created_at")
            .eq("id", profile["id"]) # type: ignore
            .limit(1)
            .execute()
            .data
        )
        if not full:
            continue
        stats = (
            supabase_admin.table("user_stats")
            .select("last_activity_date")
            .eq("user_id", profile["id"]) # type: ignore
            .limit(1)
            .execute()
            .data
        )
        last_activity = _last_activity(full[0], (stats or [{}])[0]) # type: ignore
        cutoff = now - timedelta(days=730)
        if last_activity and last_activity < cutoff:
            delete_admin_user(profile["id"]) # type: ignore
            deleted += 1
    return {"deleted_accounts": deleted}

