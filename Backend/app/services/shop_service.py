import logging
from typing import Any, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError

from app.db.supabase import supabase_admin
from app.schemas.shop import (
    ShopBoostActivation,
    ShopItemUsageResult,
    ShopState,
)

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


def _database_error(exc: Exception) -> HTTPException:
    code = str(getattr(exc, "code", "") or "")
    if code == "P0002":
        return HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản hoặc vật phẩm.")
    if code == "22023":
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yêu cầu giao dịch không hợp lệ.")
    if code in {"23505", "23514"}:
        message = str(exc).lower()
        if "inventory" in message:
            detail = "Bạn không có vật phẩm này trong kho đồ."
        elif "limit" in message:
            detail = "Bạn đã đạt giới hạn mua vật phẩm này."
        elif "xp" in message:
            detail = "Số XP khả dụng không đủ để quy đổi."
        elif "coins" in message:
            detail = "Số dư Coin không đủ để mua vật phẩm."
        else:
            detail = "Giao dịch không thể thực hiện với số dư hiện tại."
        return HTTPException(status.HTTP_409_CONFLICT, detail)

    logger.exception("Shop database RPC failed.")
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Không thể xử lý cửa hàng lúc này. Vui lòng thử lại.",
    )


def _call_shop_rpc(
    name: str,
    params: dict[str, Any],
    model: type[T],
) -> T:
    try:
        response = supabase_admin.rpc(name, params).execute()
    except Exception as exc:
        raise _database_error(exc) from exc

    try:
        return model.model_validate(response.data)
    except ValidationError as exc:
        logger.exception("Shop RPC returned an invalid response.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu trả về dữ liệu cửa hàng không hợp lệ.",
        ) from exc


def get_shop_state(profile: dict[str, Any]) -> ShopState:
    return _call_shop_rpc(
        "get_shop_state",
        {"p_user_id": profile["id"]},
        ShopState,
    )


def exchange_xp(
    profile: dict[str, Any],
    request_id: str,
    xp_amount: int,
) -> ShopState:
    return _call_shop_rpc(
        "exchange_shop_xp",
        {
            "p_user_id": profile["id"],
            "p_request_id": request_id,
            "p_xp_amount": xp_amount,
        },
        ShopState,
    )


def purchase_item(
    profile: dict[str, Any],
    request_id: str,
    item_id: str,
) -> ShopState:
    return _call_shop_rpc(
        "purchase_shop_item",
        {
            "p_user_id": profile["id"],
            "p_request_id": request_id,
            "p_shop_item_id": item_id,
        },
        ShopState,
    )


def activate_boost(
    profile: dict[str, Any],
    request_id: str,
) -> ShopBoostActivation | None:
    try:
        response = supabase_admin.rpc(
            "activate_shop_boost",
            {"p_user_id": profile["id"], "p_request_id": request_id},
        ).execute()
    except Exception as exc:
        raise _database_error(exc) from exc
    if response.data is None:
        return None
    try:
        return ShopBoostActivation.model_validate(response.data)
    except ValidationError as exc:
        logger.exception("Shop RPC returned an invalid response.")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Cơ sở dữ liệu trả về dữ liệu cửa hàng không hợp lệ.",
        ) from exc


def use_item(
    profile: dict[str, Any],
    request_id: str,
    item_id: str,
    context: str = "",
) -> ShopItemUsageResult:
    return _call_shop_rpc(
        "use_shop_item",
        {
            "p_user_id": profile["id"],
            "p_item_id": item_id,
            "p_request_id": request_id,
            "p_context": context,
        },
        ShopItemUsageResult,
    )
