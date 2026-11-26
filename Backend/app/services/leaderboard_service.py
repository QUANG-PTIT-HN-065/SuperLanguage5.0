import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.db.supabase import supabase_admin
from app.schemas.leaderboard import (
    LeaderboardLanguage,
    LeaderboardPeriod,
    LeaderboardResult,
    LeaderboardSort,
)

logger = logging.getLogger(__name__)


def _today(profile: dict[str, Any]):
    timezone_name = profile.get("timezone")
    try:
        timezone = ZoneInfo(timezone_name) # type: ignore
    except (TypeError, ValueError, ZoneInfoNotFoundError):
        logger.warning(
            "Timezone %r is unavailable; using UTC for leaderboard dates.",
            timezone_name,
        )
        timezone = ZoneInfo("UTC")
    return datetime.now(timezone).date()


def get_leaderboard(
    profile: dict[str, Any],
    *,
    period: LeaderboardPeriod,
    language: LeaderboardLanguage,
    sort: LeaderboardSort,
    search: str | None,
    limit: int,
    offset: int,
) -> LeaderboardResult:
    try:
        response = supabase_admin.rpc(
            "get_leaderboard",
            {
                "p_user_id": profile["id"],
                "p_period": period,
                "p_language": language,
                "p_sort": sort,
                "p_search": search.strip() if search and search.strip() else None,
                "p_limit": limit,
                "p_offset": offset,
                "p_today": _today(profile).isoformat(),
            },
        ).execute()
    except Exception as exc:
        logger.exception("Could not load leaderboard.")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Không thể tải bảng xếp hạng lúc này. Vui lòng thử lại.",
        ) from exc

    try:
        return LeaderboardResult.model_validate(response.data)
    except ValidationError as exc:
        logger.exception("Leaderboard RPC returned an invalid response.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu trả về bảng xếp hạng không hợp lệ.",
        ) from exc
