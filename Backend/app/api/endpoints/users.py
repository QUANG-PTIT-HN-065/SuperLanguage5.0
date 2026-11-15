from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.deps import get_current_profile
from app.schemas.reponse import BaseResponse
from app.schemas.profile import OnboardingRequest, ProfileUpdate
from app.services.profile_service import (
    complete_onboarding as complete_onboarding_profile,
    get_plan,
    get_stats,
    update_profile,
    with_effective_streak,
)

router = APIRouter()
XP_PER_LEVEL = 100


def _me_payload(profile: Dict[str, Any]) -> BaseResponse[Dict[str, Any]]:
    stats = with_effective_streak(get_stats(profile["id"]), profile["timezone"])
    return BaseResponse(
        status="success",
        message="Đã tải hồ sơ học tập.",
        data={
            "profile": profile,
            "stats": stats,
            "plan": get_plan(profile["plan_id"]),
            "needs_onboarding": profile["onboarding_completed_at"] is None,
        },
    )


@router.get("", response_model=BaseResponse[Dict[str, Any]])
def get_me(profile: Dict[str, Any] = Depends(get_current_profile)):
    """Hồ sơ + thống kê (XP, chuỗi ngày) + gói hiện tại của người dùng đang đăng nhập."""
    return _me_payload(profile)


@router.get("/progress", response_model=BaseResponse[Dict[str, Any]])
def get_progress(profile: Dict[str, Any] = Depends(get_current_profile)):
    stats = with_effective_streak(get_stats(profile["id"]), profile["timezone"])
    xp_total = max(0, int(stats.get("xp_total") or 0))
    return BaseResponse(
        status="success",
        message="Đã tải tiến độ học tập.",
        data={
            "xp_total": xp_total,
            "level": xp_total // XP_PER_LEVEL + 1,
            "xp_into_level": xp_total % XP_PER_LEVEL,
            "xp_per_level": XP_PER_LEVEL,
            "lessons_completed": int(stats.get("lessons_completed") or 0),
            "current_streak": int(stats.get("current_streak") or 0),
        },
    )


@router.patch("", response_model=BaseResponse[Dict[str, Any]])
def update_me(body: ProfileUpdate, profile: Dict[str, Any] = Depends(get_current_profile)):
    """Cập nhật hồ sơ; chỉ các trường được gửi lên mới bị thay đổi."""
    data = body.model_dump(mode="json", exclude_unset=True)
    updated = update_profile(profile["id"], data)
    return _me_payload(updated)


@router.post("/onboarding", response_model=BaseResponse[Dict[str, Any]])
def complete_onboarding(
    body: OnboardingRequest, profile: Dict[str, Any] = Depends(get_current_profile)
):
    """Hoàn tất bước chọn ngôn ngữ, trình độ, mục tiêu sau khi đăng ký."""
    updated = complete_onboarding_profile(profile["id"], body.model_dump(mode="json"))
    return _me_payload(updated)