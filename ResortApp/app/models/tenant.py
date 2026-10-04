from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
from app.database import Base
import json

class SaaSPlan(Base):
    __tablename__ = "saas_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False) # e.g. "Free Trial", "Starter", "Growth", "Enterprise"
    code = Column(String, unique=True, nullable=False, index=True) # e.g. "trial", "starter", "growth", "enterprise"
    price_monthly = Column(Float, default=0.0)
    price_yearly = Column(Float, default=0.0)
    max_branches = Column(Integer, default=1)
    max_rooms = Column(Integer, default=15)
    max_staff_users = Column(Integer, default=5)
    description = Column(String, nullable=True) # e.g. "Ideal for boutique resorts and homestays"
    badge = Column(String, nullable=True) # e.g. "Most Popular"
    features = Column(Text, nullable=True) # JSON list of enabled feature codes or display bullet points
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tenants = relationship("Tenant", back_populates="plan")

    @property
    def features_list(self):
        if not self.features:
            return ["dashboard", "room_management", "guest_portal", "qr_menu"]
        try:
            return json.loads(self.features)
        except Exception:
            return ["dashboard", "room_management", "guest_portal", "qr_menu"]


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False) # e.g. "Paradise Bay Resorts"
    slug = Column(String, unique=True, nullable=False, index=True) # e.g. "paradisebay"
    custom_domain = Column(String, unique=True, nullable=True, index=True) # e.g. "booking.paradisebay.com"
    contact_email = Column(String, nullable=False)
    contact_phone = Column(String, nullable=True)
    country = Column(String, nullable=True, default="IN")
    currency = Column(String, nullable=False, default="INR")
    timezone = Column(String, nullable=False, default="Asia/Kolkata")
    logo_url = Column(String, nullable=True)
    primary_color = Column(String, nullable=True, default="#8bc34a")
    
    plan_id = Column(Integer, ForeignKey("saas_plans.id"), nullable=True)
    subscription_status = Column(String, nullable=False, default="pending_approval") # pending_approval, active, past_due, canceled, suspended
    trial_ends_at = Column(DateTime, nullable=True)
    subscription_renews_at = Column(DateTime, nullable=True)
    last_billed_at = Column(DateTime, nullable=True)
    next_billing_date = Column(DateTime, nullable=True)
    billing_cycle = Column(String, default="monthly")
    monthly_amount = Column(Float, nullable=True, default=0.0)
    payment_status = Column(String, default="unpaid") # unpaid, payment_raised, paid, overdue
    payment_ref = Column(String, nullable=True) # UTR or transaction ID
    payment_method = Column(String, nullable=True) # payment method used
    payment_raised_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(Integer, nullable=True)
    
    is_active = Column(Boolean, default=True, nullable=False, server_default=text('true'))
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('CURRENT_TIMESTAMP'))

    plan = relationship("SaaSPlan", back_populates="tenants")
    branches = relationship("Branch", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tenant id={self.id} name={self.name} slug={self.slug} status={self.subscription_status}>"
