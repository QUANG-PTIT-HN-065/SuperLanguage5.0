import logging
from datetime import datetime, time, timedelta
from math import ceil
from typing import Any, Dict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status

from app.db.supabase import supabase_admin

logger = logging.getLogger(__name__)

DAILY_AI_CALL_LIMIT = 50
_DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh"


def _quota_window(timezone_name: object) -> tuple[str, int]:
    name = timezone_name if isinstance(timezone_name, str) and timezone_name else _DEFAULT_TIMEZONE
    try:
        tz = ZoneInfo(name)
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        logger.warning("User timezone %r is unavailable; using %s for AI quota.", name, _DEFAULT_TIMEZONE)
        tz = ZoneInfo(_DEFAULT_TIMEZONE)

    now = datetime.now(tz)
    next_midnight = datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=tz)
    retry_after = max(1, ceil((next_midnight - now).total_seconds()))
    return now.date().isoformat(), retry_after


def read_daily_ai_usage(profile: Dict[str, Any]) -> Dict[str, int]:
    """Đọc số lượt AI đã dùng hôm nay mà KHÔNG trừ thêm hạn mức."""
    user_id = profile.get("id")
    if not isinstance(user_id, str) or not user_id:
        logger.error("Authenticated profile has no user ID for AI quota display.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        )

    usage_date, _ = _quota_window(profile.get("timezone"))
    try:
        result = (
            supabase_admin.table("daily_ai_usage")
            .select("request_count")
            .eq("user_id", user_id)
            .eq("usage_date", usage_date)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not read the daily AI call usage.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        ) from exc

    rows = result.data
    row = rows[0] if isinstance(rows, list) and rows else {}
    raw_used = row.get("request_count") if isinstance(row, dict) else None
    used = raw_used if isinstance(raw_used, int) and not isinstance(raw_used, bool) else 0
    used = min(max(used, 0), DAILY_AI_CALL_LIMIT)
    return {
        "used": used,
        "daily_limit": DAILY_AI_CALL_LIMIT,
        "remaining": DAILY_AI_CALL_LIMIT - used,
    }


def consume_daily_ai_call(profile: Dict[str, Any]) -> None:
    user_id = profile.get("id")
    if not isinstance(user_id, str) or not user_id:
        logger.error("Authenticated profile has no user ID for AI quota enforcement.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        )

    usage_date, retry_after = _quota_window(profile.get("timezone"))
    try:
        result = supabase_admin.rpc(
            "consume_daily_ai_calls",
            {
                "p_user_id": user_id,
                "p_usage_date": usage_date,
                "p_daily_limit": DAILY_AI_CALL_LIMIT,
            },
        ).execute()
    except Exception as exc:
        logger.exception("Could not enforce the daily AI call quota.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        ) from exc

    rows = result.data
    decision = rows[0] if isinstance(rows, list) and rows else None
    if not isinstance(decision, dict):
        logger.error("Daily AI quota function returned an invalid response.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        )

    used = decision.get("used")
    daily_limit = decision.get("daily_limit")
    remaining = decision.get("remaining")
    allowed = decision.get("allowed")

    # Validate that the RPC returned the expected types (not values).
    # The SQL function may legitimately return used=0 when the quota row is
    # missing (COALESCE fallback) or used < daily_limit when the DB enforces
    # the limit differently, so we only reject clearly corrupt responses.
    if (
        not isinstance(allowed, bool)
        or not isinstance(daily_limit, int)
        or isinstance(daily_limit, bool)
        or not isinstance(used, int)
        or isinstance(used, bool)
        or not isinstance(remaining, int)
        or isinstance(remaining, bool)
        or used < 0
        or remaining < 0
    ):
        logger.error("Daily AI quota function returned invalid usage values.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể kiểm tra hạn mức AI lúc này. Vui lòng thử lại sau.",
        )

    if not allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Bạn đã dùng hết {DAILY_AI_CALL_LIMIT} lượt AI hôm nay. Hạn mức sẽ được đặt lại vào ngày mai.",
            headers={"Retry-After": str(retry_after)},
        )
