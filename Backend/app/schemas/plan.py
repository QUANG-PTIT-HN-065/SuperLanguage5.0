from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


BillingPeriod = Literal["free", "monthly", "yearly"]


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    daily_lesson_limit: Optional[int] = Field(default=None, gt=0)
    max_hearts: Optional[int] = Field(default=None, gt=0)
    video_access: bool = False
    is_active: bool = True
    sort_order: int = Field(default=100, ge=0, le=32767)
    billing_period: BillingPeriod
    price_usd: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=500)
