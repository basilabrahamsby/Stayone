import sys
import os
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.models.tenant import Tenant
from app.models.branch import Branch
from app.models.user import User, Role
from app.utils.auth import get_password_hash

PROPERTY_ADMIN_PERMISSIONS = [
    "/dashboard", "dashboard", "dashboard:view",
    "/bookings", "bookings",
    "/rooms", "rooms",
    "/checkouts", "checkouts",
    "/day-audit", "day_audit",
    "/food-orders", "food_orders", "food_orders_list", "food_orders_requests", "food_orders_management",
    "/food-items", "/food-categories",
    "/services", "services", "concierge", "/service-requests",
    "/inventory", "inventory", "warehouse",
    "/expenses", "expenses",
    "/account", "account", "finance",
    "/employee-management", "employee_management", "employees",
    "/report", "reports_global", "reports",
    "/billing", "billing",
    "/guestprofiles", "guest_profiles", "guests",
    "/package", "packages", "promotions",
    "/settings", "settings_group", "settings"
]

PROPERTY_ADMIN_CONFIGS = [
    {
        "branch_id": 1,
        "name": "Orchid Trails Admin",
        "email": "admin.orchid@stayone.com",
        "password": "StayoneOrchid2026!"
    },
    {
        "branch_id": 2,
        "name": "Wild Villa Admin",
        "email": "admin.wildvilla@stayone.com",
        "password": "StayoneVilla2026!"
    },
    {
        "branch_id": 3,
        "name": "Paradise Bay Admin",
        "email": "admin.paradisebay@stayone.com",
        "password": "StayoneParadise2026!"
    },
    {
        "branch_id": 4,
        "name": "Grand Mountain Admin",
        "email": "admin.grandmountain@stayone.com",
        "password": "StayoneMountain2026!"
    }
]

def run():
    db = SessionLocal()
    try:
        print("=== PROVISIONING SUPER ADMIN & PROPERTY ADMINS ===")

        # 1. Master SuperAdmin Role (ID 1, permissions: ["all"])
        superadmin_role = db.query(Role).filter(Role.id == 1).first()
        if not superadmin_role:
            superadmin_role = Role(id=1, name="admin", permissions=json.dumps(["all"]))
            db.add(superadmin_role)
            db.commit()
            db.refresh(superadmin_role)

        # 2. Master SuperAdmin User (Universal access across all properties)
        super_email = "superadmin@stayone.com"
        super_user = db.query(User).filter(User.email == super_email).first()
        if not super_user:
            super_user = User(
                tenant_id=1,
                name="Stayone Master SuperAdmin",
                email=super_email,
                hashed_password=get_password_hash("StayoneSuperAdmin2026!"),
                role_id=superadmin_role.id,
                branch_id=None, # Global access across all branches
                is_superadmin=True,
                is_active=True
            )
            db.add(super_user)
            db.commit()
            print(f"[OK] Created Global SuperAdmin: {super_email}")
        else:
            super_user.name = "Stayone Master SuperAdmin"
            super_user.is_superadmin = True
            super_user.branch_id = None
            super_user.hashed_password = get_password_hash("StayoneSuperAdmin2026!")
            db.commit()
            print(f"[OK] Updated Global SuperAdmin: {super_email}")

        # 3. Create or update Property Admin Role & User for each property
        for cfg in PROPERTY_ADMIN_CONFIGS:
            branch = db.query(Branch).filter(Branch.id == cfg["branch_id"]).first()
            if not branch:
                print(f"[SKIP] Branch #{cfg['branch_id']} not found in DB")
                continue

            # Ensure a Property Admin role exists for this branch
            role = db.query(Role).filter(Role.branch_id == branch.id, Role.name == "Property Admin").first()
            if not role:
                role = Role(
                    branch_id=branch.id,
                    name="Property Admin",
                    permissions=json.dumps(PROPERTY_ADMIN_PERMISSIONS)
                )
                db.add(role)
                db.commit()
                db.refresh(role)

            # Ensure Property Admin user exists
            admin_user = db.query(User).filter(User.email == cfg["email"]).first()
            if not admin_user:
                admin_user = User(
                    tenant_id=branch.tenant_id or 1,
                    name=cfg["name"],
                    email=cfg["email"],
                    hashed_password=get_password_hash(cfg["password"]),
                    role_id=role.id,
                    branch_id=branch.id, # Locked to this specific property
                    is_superadmin=False, # Restricted to property scope
                    is_active=True
                )
                db.add(admin_user)
                db.commit()
                print(f"[OK] Created Property Admin for '{branch.name}': {cfg['email']}")
            else:
                admin_user.name = cfg["name"]
                admin_user.role_id = role.id
                admin_user.branch_id = branch.id
                admin_user.is_superadmin = False
                admin_user.is_active = True
                admin_user.hashed_password = get_password_hash(cfg["password"])
                db.commit()
                print(f"[OK] Updated Property Admin for '{branch.name}': {cfg['email']}")

        print("\n=== SETUP COMPLETE ===")

    finally:
        db.close()

if __name__ == "__main__":
    run()
