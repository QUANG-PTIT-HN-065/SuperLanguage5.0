from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


ShopCategory = Literal["boost", "heal", "shield"]
PurchaseLimitPeriod = Literal["daily", "monthly"]


class ShopCatalogItem(BaseModel):
    id: str
    title: str
    description: str
    cost_coins: int = Field(ge=1)
    icon: str
    badge: str
    badge_class: str
    category: ShopCategory
    limit_period: PurchaseLimitPeriod
    limit_count: int = Field(ge=1)
    remaining_limit: int = Field(ge=0)
    non_stacking: bool


class ShopInventoryItem(BaseModel):
    item_id: str
    title: str
    icon: str
    quantity: int = Field(ge=1)


class ShopTransaction(BaseModel):
    id: UUID
    type: Literal["exchange", "purchase"]
    title: str
    details: str
    xp_delta: int
    coin_delta: int
    created_at: datetime


class ShopState(BaseModel):
    xp_total: int = Field(ge=0)
    xp_balance: int = Field(ge=0)
    coin_balance: int = Field(ge=0)
    items: list[ShopCatalogItem]
    inventory: list[ShopInventoryItem]
    transactions: list[ShopTransaction]


class ShopExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    xp_amount: int = Field(ge=5, le=500_000, multiple_of=5)


class ShopPurchaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    item_id: str = Field(min_length=1, max_length=80)


class ShopBoostActivateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID


class ShopBoostActivation(BaseModel):
    item_id: str
    title: str
    multiplier: float = Field(gt=1)
    already_active: bool = False


class ShopUseItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    item_id: str = Field(min_length=1, max_length=80)
    context: str = Field(default="", max_length=80)


class ShopItemUsageResult(BaseModel):
    item_id: str
    title: str
    quantity_left: int = Field(ge=0)
    already_used: bool = False
