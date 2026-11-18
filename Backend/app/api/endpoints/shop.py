from typing import Any

from fastapi import APIRouter, Depends

from app.core.deps import get_current_profile
from app.schemas.reponse import BaseResponse
from app.schemas.shop import ShopExchangeRequest, ShopPurchaseRequest, ShopState
from app.services.shop_service import exchange_xp, get_shop_state, purchase_item

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
