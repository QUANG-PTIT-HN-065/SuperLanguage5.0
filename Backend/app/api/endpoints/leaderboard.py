import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_optional_profile
from app.schemas.leaderboard import (
    LeaderboardLanguage,
    LeaderboardPeriod,
    LeaderboardResult,
    LeaderboardSort,
)
from app.schemas.reponse import BaseResponse
from app.services.leaderboard_service import get_leaderboard

router = APIRouter()


@router.get("", response_model=BaseResponse[LeaderboardResult])
def read_leaderboard(
    period: LeaderboardPeriod = "week",
    language: LeaderboardLanguage = "all",
    sort: LeaderboardSort = "xp",
    search: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=100_000),
    profile: Optional[dict[str, Any]] = Depends(get_optional_profile),
):
    # Khách (không token): dùng id ảo để RPC trả current_user = null,
    # bảng xếp hạng vẫn đầy đủ cho mọi người xem.
    if profile is None:
        profile = {"id": str(uuid.uuid4()), "timezone": None}
    data = get_leaderboard(
        profile,
        period=period,
        language=language,
        sort=sort,
        search=search,
        limit=limit,
        offset=offset,
    )
    return BaseResponse(
        status="success",
        message="Đã tải bảng xếp hạng.",
        data=data,
    )
