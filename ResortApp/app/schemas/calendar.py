from pydantic import BaseModel
from datetime import date
from typing import Optional

class PricingCalendarBase(BaseModel):
    start_date: date
    end_date: date
    day_type: str # 'HOLIDAY' or 'LONG_WEEKEND'
    description: Optional[str] = None
    branch_id: Optional[int] = None

class PricingCalendarCreate(PricingCalendarBase):
    pass

class PricingCalendarUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    day_type: Optional[str] = None
    description: Optional[str] = None
    branch_id: Optional[int] = None

class PricingCalendarOut(PricingCalendarBase):
    id: int

    class Config:
        from_attributes = True

