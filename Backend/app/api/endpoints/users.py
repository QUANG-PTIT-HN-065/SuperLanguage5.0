from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.deps import get_current_profile
from app.schemas.profile import OnboardingRequest, ProfileUpdate
from app.services.profile_service import (
    get_plan,
    get_stats,
    now_iso,
    update_profile,
    validate_languages,
    with_effective_streak,
)

router = APIRouter()


def _me_payload(profile: Dict[str, Any]) -> Dict[str, Any]:
    stats = with_effective_streak(get_stats(profile["id"]), profile["timezone"])
    return {
        "status": "success",
        "profile": profile,
        "stats": stats,
        "plan": get_plan(profile["plan_id"]),
        "needs_onboarding": profile["onboarding_completed_at"] is None,
    }


@router.get("")
def get_me(profile: Dict[str, Any] = Depends(get_current_profile)):
    """Hồ sơ + thống kê (XP, chuỗi ngày) + gói hiện tại của người dùng đang đăng nhập."""
    return _me_payload(profile)


@router.patch("")
def update_me(body: ProfileUpdate, profile: Dict[str, Any] = Depends(get_current_profile)):
    """Cập nhật hồ sơ; chỉ các trường được gửi lên mới bị thay đổi."""
    data = body.model_dump(mode="json", exclude_unset=True)
    validate_languages(data.get("native_language"), data.get("target_language"))
    updated = update_profile(profile["id"], data)
    return _me_payload(updated)


@router.post("/onboarding")
def complete_onboarding(
    body: OnboardingRequest, profile: Dict[str, Any] = Depends(get_current_profile)
):
    """Hoàn tất bước chọn ngôn ngữ, trình độ, mục tiêu sau khi đăng ký."""
    data = body.model_dump(mode="json")
    validate_languages(data["native_language"], data["target_language"])
    data["onboarding_completed_at"] = now_iso()
    updated = update_profile(profile["id"], data)
    return _me_payload(updated)