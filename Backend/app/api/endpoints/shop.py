from typing import Any

from fastapi import APIRouter, Depends

from app.core.deps import get_current_profile
from app.schemas.reponse import BaseResponse
from app.schemas.shop import (
    ShopBoostActivateRequest,
    ShopBoostActivation,
    ShopExchangeRequest,
    ShopItemUsageResult,
    ShopPurchaseRequest,
    ShopState,
    ShopUseItemRequest,
)
from app.services.shop_service import (
    activate_boost,
    exchange_xp,
    get_shop_state,
    purchase_item,
    use_item,
)

router = APIRouter()


@router.get("", response_model=BaseResponse[ShopState])
def read_shop(profile: dict[str, Any] = Depends(get_current_profile)):
    return BaseResponse(
        status="success",
        message="Đã tải cửa hàng.",
        data=get_shop_state(profile),
    )


@router.post("/exchange", response_model=BaseResponse[ShopState])
def exchange_shop_xp(
    body: ShopExchangeRequest,
    profile: dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã quy đổi XP sang Coin.",
        data=exchange_xp(profile, str(body.request_id), body.xp_amount),
    )


@router.post("/purchase", response_model=BaseResponse[ShopState])
def purchase_shop_item(
    body: ShopPurchaseRequest,
    profile: dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã mua vật phẩm.",
        data=purchase_item(profile, str(body.request_id), body.item_id),
    )


@router.post("/boost/activate", response_model=BaseResponse[ShopBoostActivation | None])
def activate_shop_boost(
    body: ShopBoostActivateRequest,
    profile: dict[str, Any] = Depends(get_current_profile),
):
    """Vào bài học: tự dùng vật phẩm tăng XP mạnh nhất trong kho (thắng/thua đều tính đã dùng)."""
    data = activate_boost(profile, str(body.request_id))
    return BaseResponse(
        status="success",
        message="Đã kích hoạt vật phẩm tăng XP." if data else "Không có vật phẩm tăng XP trong kho.",
        data=data,
    )


@router.post("/items/use", response_model=BaseResponse[ShopItemUsageResult])
def use_shop_item(
    body: ShopUseItemRequest,
    profile: dict[str, Any] = Depends(get_current_profile),
):
    return BaseResponse(
        status="success",
        message="Đã sử dụng vật phẩm.",
        data=use_item(profile, str(body.request_id), body.item_id, body.context),
    )
