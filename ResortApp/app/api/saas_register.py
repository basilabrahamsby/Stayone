from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import re
import json
import os
import shutil
import uuid

from app.database import SessionLocal
from app.utils.auth import get_db, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.models.tenant import Tenant, SaaSPlan
from app.models.branch import Branch
from app.models.user import User, Role
from app.models.room import Room
from app.utils.tenant_context import get_current_tenant

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/saas", tags=["SaaS Registration & Subscriptions"])

RESERVED_SLUGS = {
    "admin", "administrator", "api", "app", "auth", "dashboard", "help", 
    "login", "mail", "payment", "register", "root", "saas", "stayone", 
    "support", "sysadmin", "system", "user", "userend", "www"
}

# --- Pydantic Schemas ---

class CheckSlugResponse(BaseModel):
    slug: str
    available: bool
    reason: Optional[str] = None

class SaaSPlanResponse(BaseModel):
    id: int
    name: str
    code: str
    price_monthly: float
    price_yearly: float
    max_branches: int
    max_rooms: int
    max_staff_users: int
    features: List[str]

class SaaSUserRegisterRequest(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=3, max_length=50)
    owner_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    phone: Optional[str] = None
    country: Optional[str] = "IN"
    currency: Optional[str] = "INR"
    plan_code: Optional[str] = "starter"
    branch_code: str = Field(..., min_length=1, max_length=50, description="Compulsory Aiosell Hotel Code")
    location: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    facebook: Optional[str] = None
    instagram: Optional[str] = None
    twitter: Optional[str] = None
    linkedin: Optional[str] = None
    image_url: Optional[str] = None

class SaaSRegisterResponse(BaseModel):
    success: bool
    message: str
    access_token: str
    token_type: str = "bearer"
    tenant: Dict[str, Any]
    branch: Dict[str, Any]

# Default Admin Permissions granting full dashboard access
DEFAULT_OWNER_PERMISSIONS = [
    "/dashboard", "dashboard:view", "dashboard",
    "/rooms", "/bookings", "/checkouts", "/day-audit",
    "/food-orders", "/food-items", "/food-categories",
    "/services", "/service-requests",
    "/inventory", "/inventory-items", "/vendors", "/purchases", "/stock-requisitions", "/waste-logs",
    "/expenses", "/accounts", "/ledger", "/journal", "/day-book",
    "/employees", "/attendance", "/leaves", "/salaries",
    "/reports", "/gst-reports",
    "/branches", "/users", "/roles", "/settings", "/channel-manager"
]

# --- Endpoints ---

@router.get("/check-slug", response_model=CheckSlugResponse)
def check_slug(slug: str, db: Session = Depends(get_db)):
    """Check whether a business slug is valid and available"""
    clean_slug = slug.strip().lower()
    
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", clean_slug):
        return CheckSlugResponse(
            slug=clean_slug,
            available=False,
            reason="Slug can only contain lowercase letters, numbers, and hyphens"
        )
        
    if clean_slug in RESERVED_SLUGS:
        return CheckSlugResponse(
            slug=clean_slug,
            available=False,
            reason="This slug is reserved by the platform"
        )
        
    existing = db.query(Tenant).filter(Tenant.slug == clean_slug).first()
    if existing:
        return CheckSlugResponse(
            slug=clean_slug,
            available=False,
            reason="This URL is already taken by another resort business"
        )
        
    return CheckSlugResponse(slug=clean_slug, available=True)


@router.get("/plans", response_model=List[SaaSPlanResponse])
def list_plans(db: Session = Depends(get_db)):
    """List all available SaaS subscription plans"""
    plans = db.query(SaaSPlan).filter(SaaSPlan.is_active == True).order_by(SaaSPlan.price_monthly.asc()).all()
    return [
        SaaSPlanResponse(
            id=p.id,
            name=p.name,
            code=p.code,
            price_monthly=p.price_monthly,
            price_yearly=p.price_yearly,
            max_branches=p.max_branches,
            max_rooms=p.max_rooms,
            max_staff_users=p.max_staff_users,
            features=p.features_list
        ) for p in plans
    ]


@router.post("/upload-image")
async def upload_property_image(image: UploadFile = File(...)):
    """Upload a property profile / banner image during registration"""
    if not image or not image.filename:
        raise HTTPException(status_code=400, detail="No image file provided")
    file_ext = image.filename.split('.')[-1].lower() if '.' in image.filename else 'jpg'
    if file_ext not in ['jpg', 'jpeg', 'png', 'webp']:
        raise HTTPException(status_code=400, detail="Unsupported image format. Allowed: JPG, PNG, WEBP")
    unique_filename = f"property_{uuid.uuid4().hex}.{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
    return {"image_url": f"/uploads/{unique_filename}"}


@router.post("/register", response_model=SaaSRegisterResponse)
def register_saas_business(req: SaaSUserRegisterRequest, db: Session = Depends(get_db)):
    """
    Frictionless 60-second self-service onboarding:
    1. Validates slug and email.
    2. Provisions Tenant with 14-day free trial.
    3. Creates primary Branch (Main Property).
    4. Creates Owner/Admin Role with full permissions.
    5. Creates Owner User and generates instant JWT login token.
    """
    clean_slug = req.slug.strip().lower()
    
    # 1. Validation
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", clean_slug) or clean_slug in RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail="Invalid or reserved business URL slug")
        
    if db.query(Tenant).filter(Tenant.slug == clean_slug).first():
        raise HTTPException(status_code=400, detail="Business URL slug is already taken")
        
    if db.query(User).filter(User.email == req.email.strip().lower()).first():
        raise HTTPException(status_code=400, detail="A user with this email address already exists")

    # 2. Get Selected Plan (default: starter - 10 rooms)
    plan = db.query(SaaSPlan).filter(SaaSPlan.code == (req.plan_code or "starter")).first()
    if not plan:
        plan = db.query(SaaSPlan).filter(SaaSPlan.code == "starter").first()

    try:
        # 3. Create Tenant (No free trial - pending platform admin approval)
        now = datetime.now(timezone.utc)
        monthly_amt = plan.price_monthly if plan and plan.price_monthly > 0 else 2500.0
        
        tenant = Tenant(
            name=req.business_name.strip(),
            slug=clean_slug,
            contact_email=req.email.strip().lower(),
            contact_phone=req.phone.strip() if req.phone else None,
            country=req.country or "IN",
            currency=req.currency or "INR",
            plan_id=plan.id if plan else None,
            subscription_status="pending_approval",
            trial_ends_at=None,
            billing_cycle="monthly",
            monthly_amount=monthly_amt,
            payment_status="unpaid",
            next_billing_date=now + timedelta(days=30),
            is_active=True
        )
        db.add(tenant)
        db.flush() # get tenant.id

        # 4. Validate and Sanitize Compulsory Aiosell Hotel Code
        branch_code = re.sub(r'[^a-zA-Z0-9_-]', '', req.branch_code.strip()).upper()
        if not branch_code:
            raise HTTPException(status_code=400, detail="Aiosell Hotel Code is compulsory. Please enter your hotel code.")

        if db.query(Branch).filter(Branch.code == branch_code).first():
            raise HTTPException(
                status_code=400, 
                detail=f"Aiosell Hotel Code '{branch_code}' is already registered with another property. Please enter your unique Aiosell code."
            )

        # 5. Create Default Branch with Aiosell Hotel/Branch Code & Details
        branch = Branch(
            tenant_id=tenant.id,
            name=req.business_name.strip(),
            code=branch_code,
            phone=req.phone.strip() if req.phone else None,
            email=req.email.strip().lower(),
            address=req.address.strip() if req.address else None,
            location=req.location.strip() if req.location else None,
            gst_number=req.gst_number.strip().upper() if req.gst_number else None,
            facebook=req.facebook.strip() if req.facebook else None,
            instagram=req.instagram.strip() if req.instagram else None,
            twitter=req.twitter.strip() if req.twitter else None,
            linkedin=req.linkedin.strip() if req.linkedin else None,
            image_url=req.image_url.strip() if req.image_url else None,
            is_active=True
        )
        db.add(branch)
        db.flush() # get branch.id

        # 6. Create Default Owner Role for this Branch
        owner_role = Role(
            name="Owner / Admin",
            branch_id=branch.id,
            permissions=json.dumps(DEFAULT_OWNER_PERMISSIONS)
        )
        db.add(owner_role)
        db.flush() # get owner_role.id

        # 7. Create Owner User
        hashed_pwd = get_password_hash(req.password)
        user = User(
            tenant_id=tenant.id,
            name=req.owner_name.strip(),
            email=req.email.strip().lower(),
            hashed_password=hashed_pwd,
            phone=req.phone,
            is_active=True,
            role_id=owner_role.id,
            branch_id=branch.id,
            is_superadmin=False # Branch admin scoped exclusively to their branch
        )
        db.add(user)
        db.commit()

        # Refresh objects
        db.refresh(tenant)
        db.refresh(branch)
        db.refresh(user)

        # 8. Generate JWT Access Token for Immediate Login
        token_data = {
            "user_id": user.id,
            "tenant_id": tenant.id,
            "tenant_slug": tenant.slug,
            "role": owner_role.name,
            "branch_id": branch.id,
            "is_superadmin": False,
            "permissions": DEFAULT_OWNER_PERMISSIONS
        }
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(hours=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return SaaSRegisterResponse(
            success=True,
            message="Registration submitted! Once platform admin accepts your property, full app features will be unlocked.",
            access_token=access_token,
            tenant={
                "id": tenant.id,
                "name": tenant.name,
                "slug": tenant.slug,
                "currency": tenant.currency,
                "subscription_status": tenant.subscription_status,
                "is_approved": False,
                "monthly_amount": tenant.monthly_amount,
                "payment_status": tenant.payment_status,
                "next_billing_date": str(tenant.next_billing_date) if tenant.next_billing_date else None,
                "branch_code": branch.code
            },
            branch={
                "id": branch.id,
                "name": branch.name,
                "code": branch.code
            }
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"Error during SaaS registration: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.get("/tenant-profile")
def get_tenant_profile(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Fetch current tenant details, active plan, quotas, approval status, and billing info"""
    primary_branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()
    branch_count = db.query(Branch).filter(Branch.tenant_id == tenant.id).count()
    room_count = db.query(Room).join(Branch).filter(Branch.tenant_id == tenant.id).count()
    user_count = db.query(User).filter(User.tenant_id == tenant.id).count()

    is_approved = tenant.subscription_status == "active"

    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "custom_domain": tenant.custom_domain,
        "contact_email": tenant.contact_email,
        "contact_phone": tenant.contact_phone,
        "currency": tenant.currency,
        "timezone": tenant.timezone,
        "logo_url": tenant.logo_url,
        "primary_color": tenant.primary_color,
        "subscription_status": tenant.subscription_status,
        "is_approved": is_approved,
        "payment_status": tenant.payment_status or "unpaid",
        "monthly_amount": tenant.monthly_amount or (tenant.plan.price_monthly if tenant.plan else 2500.0),
        "last_billed_at": str(tenant.last_billed_at) if tenant.last_billed_at else None,
        "next_billing_date": str(tenant.next_billing_date) if tenant.next_billing_date else None,
        "branch_code": primary_branch.code if primary_branch else None,
        "plan": {
            "name": tenant.plan.name if tenant.plan else "Starter",
            "code": tenant.plan.code if tenant.plan else "starter",
            "price_monthly": tenant.monthly_amount or (tenant.plan.price_monthly if tenant.plan else 2500.0),
            "max_branches": tenant.plan.max_branches if tenant.plan else 1,
            "max_rooms": tenant.plan.max_rooms if tenant.plan else 20,
            "max_staff_users": tenant.plan.max_staff_users if tenant.plan else 10,
            "features": tenant.plan.features_list if tenant.plan else []
        },
        "usage": {
            "branches": branch_count,
            "rooms": room_count,
            "users": user_count
        }
    }


# --- SuperAdmin Approval Endpoints ---

class ApproveTenantRequest(BaseModel):
    branch_code: Optional[str] = Field(None, max_length=50, description="Assigned Aiosell Hotel / Branch Code")

@router.get("/admin/overview")
def get_superadmin_overview(db: Session = Depends(get_db)):
    """Fast, single-trip aggregated KPI statistics for Super Admin Dashboard"""
    from app.models.checkout import Checkout
    from app.models.expense import Expense
    from app.models.room import Room
    from app.models.employee import Employee
    from sqlalchemy import func

    # Execute high-speed SQL aggregates directly inside PostgreSQL
    total_rev = db.query(func.coalesce(func.sum(Checkout.grand_total), 0.0)).scalar() or 0.0
    total_exp = db.query(func.coalesce(func.sum(Expense.amount), 0.0)).scalar() or 0.0
    total_rooms = db.query(func.count(Room.id)).scalar() or 0
    occupied_rooms = db.query(func.count(Room.id)).filter(
        func.lower(Room.status).in_(["occupied", "booked", "checked-in", "checkedin", "checked_in"])
    ).scalar() or 0
    active_employees = db.query(func.count(Employee.id)).filter(Employee.is_active == True).scalar() or 0
    total_properties = db.query(func.count(Tenant.id)).scalar() or 0
    active_properties = db.query(func.count(Tenant.id)).filter(Tenant.is_active == True, Tenant.subscription_status == "active").scalar() or 0

    return {
        "total_revenue": float(total_rev),
        "total_expenses": float(total_exp),
        "total_rooms": int(total_rooms),
        "occupied_rooms": int(occupied_rooms),
        "active_employees": int(active_employees),
        "total_properties": int(total_properties),
        "active_properties": int(active_properties)
    }


@router.get("/admin/tenants")
def list_all_tenants_for_admin(db: Session = Depends(get_db)):
    """List all registered properties and approval/billing status for Platform SuperAdmin with high efficiency"""
    from sqlalchemy.orm import joinedload
    from sqlalchemy import func

    tenants = db.query(Tenant).options(
        joinedload(Tenant.plan),
        joinedload(Tenant.branches),
        joinedload(Tenant.users)
    ).order_by(Tenant.created_at.desc()).all()

    # Pre-fetch room counts per branch in a single aggregated query
    room_counts = dict(
        db.query(Branch.tenant_id, func.count(Room.id))
        .join(Room, Room.branch_id == Branch.id)
        .group_by(Branch.tenant_id)
        .all()
    )

    result = []
    for t in tenants:
        primary_branch = t.branches[0] if t.branches else None
        owner_user = next((u for u in t.users if not getattr(u, 'is_superadmin', False)), (t.users[0] if t.users else None))
        result.append({
            "id": t.id,
            "name": t.name,
            "business_name": t.name,
            "slug": t.slug,
            "owner_name": owner_user.name if owner_user else "—",
            "email": owner_user.email if owner_user else t.contact_email,
            "contact_email": t.contact_email,
            "contact_phone": t.contact_phone,
            "subscription_status": t.subscription_status,
            "is_approved": t.subscription_status == "active",
            "is_active": bool(t.is_active),
            "plan_name": t.plan.name if t.plan else "Starter",
            "plan_code": t.plan.code if t.plan else "starter",
            "monthly_amount": t.monthly_amount or (t.plan.price_monthly if t.plan else 2500.0),
            "payment_status": t.payment_status or "unpaid",
            "branch_code": primary_branch.code if primary_branch else "N/A",
            "branch_id": primary_branch.id if primary_branch else None,
            "room_count": room_counts.get(t.id, 0),
            "created_at": str(t.created_at),
            "approved_at": str(t.approved_at) if t.approved_at else None
        })
    return result


@router.post("/admin/approve-tenant/{tenant_id}")
def approve_tenant(
    tenant_id: int, 
    req: Optional[ApproveTenantRequest] = None, 
    db: Session = Depends(get_db)
):
    """Approve and activate a registered property workspace, optionally assigning/updating hotel/branch code"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant property not found")
    
    assigned_code = None
    if req and req.branch_code and req.branch_code.strip():
        clean_code = re.sub(r'[^a-zA-Z0-9_-]', '', req.branch_code.strip()).upper()
        if clean_code:
            conflict = db.query(Branch).filter(Branch.code == clean_code, Branch.tenant_id != tenant.id).first()
            if conflict:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Hotel code '{clean_code}' is already assigned to property '{conflict.name}'. Please enter a unique code."
                )
            primary_branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()
            if primary_branch:
                primary_branch.code = clean_code
                assigned_code = clean_code
            else:
                primary_branch = Branch(
                    tenant_id=tenant.id,
                    name=tenant.name,
                    code=clean_code,
                    phone=tenant.contact_phone,
                    email=tenant.contact_email,
                    is_active=True
                )
                db.add(primary_branch)
                assigned_code = clean_code
    else:
        primary_branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()
        if primary_branch:
            assigned_code = primary_branch.code

    tenant.subscription_status = "active"
    tenant.is_active = True
    tenant.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tenant)
    
    msg = f"Property '{tenant.name}' approved successfully!"
    if assigned_code:
        msg += f" Hotel Code set to '{assigned_code}'."
    return {
        "success": True, 
        "message": msg,
        "tenant_id": tenant.id,
        "subscription_status": tenant.subscription_status,
        "is_active": tenant.is_active,
        "branch_code": assigned_code
    }


@router.post("/admin/update-branch-code/{tenant_id}")
def update_tenant_branch_code(
    tenant_id: int, 
    req: ApproveTenantRequest, 
    db: Session = Depends(get_db)
):
    """Allow SuperAdmin to assign or update Aiosell hotel/branch code anytime"""
    if not req.branch_code or not req.branch_code.strip():
        raise HTTPException(status_code=400, detail="Hotel code is required")
    
    clean_code = re.sub(r'[^a-zA-Z0-9_-]', '', req.branch_code.strip()).upper()
    if not clean_code:
        raise HTTPException(status_code=400, detail="Invalid hotel code")
        
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant property not found")
        
    conflict = db.query(Branch).filter(Branch.code == clean_code, Branch.tenant_id != tenant.id).first()
    if conflict:
        raise HTTPException(status_code=400, detail=f"Hotel code '{clean_code}' is already in use by '{conflict.name}'.")
        
    primary_branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()
    if not primary_branch:
        primary_branch = Branch(
            tenant_id=tenant.id,
            name=tenant.name,
            code=clean_code,
            is_active=True
        )
        db.add(primary_branch)
    else:
        primary_branch.code = clean_code
        
    db.commit()
    return {"success": True, "message": f"Hotel code updated to '{clean_code}'", "branch_code": clean_code}


@router.post("/admin/toggle-tenant-status/{tenant_id}")
def toggle_tenant_status(
    tenant_id: int, 
    db: Session = Depends(get_db)
):
    """Enable or disable a tenant property workspace (SuperAdmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant property not found")
        
    tenant.is_active = not bool(tenant.is_active)
    
    # Synchronize all branches of this tenant
    branches = db.query(Branch).filter(Branch.tenant_id == tenant.id).all()
    for b in branches:
        b.is_active = tenant.is_active
        
    db.commit()
    db.refresh(tenant)
    status_label = "enabled" if tenant.is_active else "disabled"
    return {
        "success": True, 
        "message": f"Property '{tenant.name}' has been {status_label} successfully.", 
        "tenant_id": tenant.id, 
        "is_active": tenant.is_active
    }


# --- Property Billing & Payment Endpoints (Day 1 & Monthly) ---

class PayBillRequest(BaseModel):
    payment_method: Optional[str] = "UPI / Card"
    transaction_ref: Optional[str] = None

@router.get("/billing")
def get_tenant_billing(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Fetch property billing, monthly subscription rates, and payment options"""
    primary_branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()
    monthly_amt = tenant.monthly_amount or (tenant.plan.price_monthly if tenant.plan else 2500.0)
    next_date = tenant.next_billing_date or (datetime.now(timezone.utc) + timedelta(days=30))
    
    return {
        "tenant_id": tenant.id,
        "business_name": tenant.name,
        "subscription_status": tenant.subscription_status,
        "is_approved": tenant.subscription_status == "active",
        "plan": {
            "name": tenant.plan.name if tenant.plan else "Starter",
            "code": tenant.plan.code if tenant.plan else "starter",
            "price_monthly": monthly_amt,
        },
        "branch_code": primary_branch.code if primary_branch else "N/A",
        "monthly_amount": monthly_amt,
        "payment_status": tenant.payment_status or "unpaid",
        "billing_cycle": tenant.billing_cycle or "monthly",
        "last_billed_at": str(tenant.last_billed_at) if tenant.last_billed_at else None,
        "next_billing_date": str(next_date),
        "currency": tenant.currency or "INR"
    }


@router.post("/pay-bill")
def pay_monthly_bill(
    req: Optional[PayBillRequest] = None,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Process property bill payment on day 1 or monthly recurring"""
    now = datetime.now(timezone.utc)
    tenant.last_billed_at = now
    tenant.next_billing_date = now + timedelta(days=30)
    tenant.payment_status = "paid"
    
    db.commit()
    db.refresh(tenant)
    return {
        "success": True,
        "message": f"Payment of {tenant.currency} {tenant.monthly_amount:,.2f} completed successfully for {tenant.name}!",
        "payment_status": tenant.payment_status,
        "next_billing_date": str(tenant.next_billing_date)
    }
