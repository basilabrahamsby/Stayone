from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class PricingCalendar(Base):
    __tablename__ = "pricing_calendar"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True, index=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    day_type = Column(String, nullable=False) # 'HOLIDAY' or 'LONG_WEEKEND'
    description = Column(String, nullable=True) # e.g., "Christmas"

