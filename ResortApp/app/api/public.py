"""
Public API endpoints for user-facing frontend
These endpoints don't require authentication
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import SessionLocal
from app.models.room import Room
from app.models.Package import Package, PackageBooking, PackageBookingRoom
from app.models.booking import Booking, BookingRoom
from app.models.food_item import FoodItem
from app.models.food_category import FoodCategory
from app.models.branch import Branch
from app.models.service import Service
from app.schemas.packages import PackageOut
from app.schemas.room import RoomOut
from app.schemas.foodorder import FoodOrderCreate, FoodOrderOut
from app.schemas.service_request import ServiceRequestCreate, ServiceRequestOut
from typing import List
from pydantic import BaseModel
from datetime import date

# Import other schemas if needed or stick to simple
router = APIRouter(prefix="/public", tags=["Public"])

from app.database import get_db
# Remove local get_db definition to ensure dependency override works in tests


# Schemas for Availability
class PublicRoomRef(BaseModel):
    id: int # Room ID

class PublicBookingOut(BaseModel):
    id: int
    status: str
    check_in: date
    check_out: date
    rooms: List[PublicRoomRef]
    class Config: from_attributes = True

class PublicPackageRoomRef(BaseModel):
    room_id: int # Room ID from PackageBookingRoom

class PublicPackageBookingOut(BaseModel):
    id: int
    status: str
    check_in: date
    check_out: date
    rooms: List[PublicPackageRoomRef]
    package_id: int
    class Config: from_attributes = True


# Schemas for App Version
class AppVersionCheck(BaseModel):
    min_version: str
    latest_version: str
    play_store_url: str
    force_update: bool

@router.get("/app-version", response_model=AppVersionCheck)
def get_app_version(db: Session = Depends(get_db)):
    """Get the minimum required app version and Play Store URL for force updates"""
    from app.models.settings import SystemSetting
    
    # Query database settings (branch_id=None for global app version settings)
    min_version_setting = db.query(SystemSetting).filter(SystemSetting.key == "mobile_app_min_version", SystemSetting.branch_id == None).first()
    play_store_url_setting = db.query(SystemSetting).filter(SystemSetting.key == "mobile_app_play_store_url", SystemSetting.branch_id == None).first()
    force_update_setting = db.query(SystemSetting).filter(SystemSetting.key == "mobile_app_force_update", SystemSetting.branch_id == None).first()

    min_version = min_version_setting.value if min_version_setting else "1.2.1"
    play_store_url = play_store_url_setting.value if play_store_url_setting else "https://play.google.com/store/apps/details?id=com.teqmates.stayone_employee"
    force_update = (force_update_setting.value.lower() == "true") if force_update_setting else True

    return AppVersionCheck(
        min_version=min_version,
        latest_version=min_version,
        play_store_url=play_store_url,
        force_update=force_update
    )


def _is_branch_active(db: Session, branch_id: int) -> bool:
    """Check if branch and its parent tenant workspace are active"""
    from app.models.branch import Branch
    from app.models.tenant import Tenant
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch or not branch.is_active:
        return False
    if branch.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == branch.tenant_id).first()
        if tenant and not tenant.is_active:
            return False
    return True

# Public Branches endpoint
@router.get("/branches")
def get_public_branches(db: Session = Depends(get_db)):
    """Get all active branches without authentication (excluding disabled properties)"""
    try:
        from app.models.tenant import Tenant
        from sqlalchemy import or_
        branches = db.query(Branch).outerjoin(Tenant, Branch.tenant_id == Tenant.id).filter(
            Branch.is_active == True,
            or_(Branch.tenant_id == None, Tenant.is_active == True)
        ).all()
        return branches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching branches: {str(e)}")

# Public Rooms endpoint
@router.get("/rooms", response_model=List[RoomOut])
def get_public_rooms(db: Session = Depends(get_db), branch_id: int = None, skip: int = 0, limit: int = 100):
    """Get all rooms for a specific branch (only if active)"""
    try:
        if branch_id and not _is_branch_active(db, branch_id):
            return []
        query = db.query(Room)
        if branch_id:
            query = query.filter(Room.branch_id == branch_id)
        else:
            # Only include rooms from active branches
            from app.models.tenant import Tenant
            from sqlalchemy import or_
            query = query.join(Branch, Room.branch_id == Branch.id).outerjoin(Tenant, Branch.tenant_id == Tenant.id).filter(
                Branch.is_active == True,
                or_(Branch.tenant_id == None, Tenant.is_active == True)
            )
        rooms = query.offset(skip).limit(limit).all()
        return rooms
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching rooms: {str(e)}")

# Public Packages endpoint
@router.get("/packages", response_model=List[PackageOut])
def get_public_packages(db: Session = Depends(get_db), branch_id: int = None, skip: int = 0, limit: int = 100):
    """Get all packages for a specific branch (only if active)"""
    try:
        if branch_id and not _is_branch_active(db, branch_id):
            return []
        query = db.query(Package)
        if branch_id:
            query = query.filter(Package.branch_id == branch_id)
        else:
            from app.models.tenant import Tenant
            from sqlalchemy import or_
            query = query.join(Branch, Package.branch_id == Branch.id).outerjoin(Tenant, Branch.tenant_id == Tenant.id).filter(
                Branch.is_active == True,
                or_(Branch.tenant_id == None, Tenant.is_active == True)
            )
        packages = query.options(
            joinedload(Package.images),
            joinedload(Package.branch)
        ).offset(skip).limit(limit).all()
        return packages
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching packages: {str(e)}")

# Public Food Items endpoint
@router.get("/food-items")
def get_public_food_items(db: Session = Depends(get_db), branch_id: int = None):
    """Get all food items for a specific branch (only if active)"""
    try:
        if branch_id and not _is_branch_active(db, branch_id):
            return []
        query = db.query(FoodItem)
        if branch_id:
            query = query.filter(FoodItem.branch_id == branch_id)
        else:
            from app.models.tenant import Tenant
            from sqlalchemy import or_
            query = query.join(Branch, FoodItem.branch_id == Branch.id).outerjoin(Tenant, Branch.tenant_id == Tenant.id).filter(
                Branch.is_active == True,
                or_(Branch.tenant_id == None, Tenant.is_active == True)
            )
        food_items = query.options(
            joinedload(FoodItem.images),
            joinedload(FoodItem.category)
        ).all()
        return food_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching food items: {str(e)}")

# Public Food Categories endpoint
@router.get("/food-categories")
def get_public_food_categories(db: Session = Depends(get_db)):
    """Get all food categories without authentication"""
    try:
        categories = db.query(FoodCategory).all()
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching food categories: {str(e)}")

# Public Services endpoint
@router.get("/services")
def get_public_services(db: Session = Depends(get_db), branch_id: int = None):
    """Get all services for a specific branch (only if active)"""
    try:
        if branch_id and not _is_branch_active(db, branch_id):
            return []
        query = db.query(Service).filter(Service.is_visible_to_guest == True)
        if branch_id:
            query = query.filter(Service.branch_id == branch_id)
        else:
            from app.models.tenant import Tenant
            from sqlalchemy import or_
            query = query.join(Branch, Service.branch_id == Branch.id).outerjoin(Tenant, Branch.tenant_id == Tenant.id).filter(
                Branch.is_active == True,
                or_(Branch.tenant_id == None, Tenant.is_active == True)
            )
        services = query.options(joinedload(Service.images)).all()
        return services
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching services: {str(e)}")

# Public Bookings Availability
@router.get("/bookings", response_model=List[PublicBookingOut])
def get_public_bookings(db: Session = Depends(get_db), branch_id: int = None, skip: int = 0, limit: int = 500):
    """Get minimal booking data for a specific branch"""
    try:
        query = db.query(Booking)
        if branch_id:
            query = query.filter(Booking.branch_id == branch_id)
        bookings = query.options(joinedload(Booking.booking_rooms)).offset(skip).limit(limit).all()
        # Manually construct to map booking_rooms -> rooms
        results = []
        for b in bookings:
            room_refs = []
            if b.booking_rooms:
                for br in b.booking_rooms:
                    if br.room_id:
                         room_refs.append(PublicRoomRef(id=br.room_id))
            
            results.append(PublicBookingOut(
                id=b.id,
                status=b.status,
                check_in=b.check_in,
                check_out=b.check_out,
                rooms=room_refs
            ))
        return results
    except Exception as e:
        print(f"Error fetching public bookings: {e}")
        return []

# Public Package Bookings Availability
@router.get("/package-bookings", response_model=List[PublicPackageBookingOut])
def get_public_package_bookings(db: Session = Depends(get_db), branch_id: int = None, skip: int = 0, limit: int = 500):
    """Get minimal package booking data for a specific branch"""
    try:
        query = db.query(PackageBooking)
        if branch_id:
            query = query.filter(PackageBooking.branch_id == branch_id)
        bookings = query.options(joinedload(PackageBooking.rooms)).offset(skip).limit(limit).all()
        # Manually construct
        results = []
        for b in bookings:
            room_refs = []
            if b.rooms:
                for br in b.rooms:
                    if br.room_id:
                         room_refs.append(PublicPackageRoomRef(room_id=br.room_id))
            
            results.append(PublicPackageBookingOut(
                id=b.id,
                status=b.status,
                check_in=b.check_in,
                check_out=b.check_out,
                rooms=room_refs,
                package_id=b.package_id
            ))
        return results
    except Exception as e:
        print(f"Error fetching public package bookings: {e}")
        return []


# Public anonymous food ordering endpoint
@router.post("/food-orders", response_model=FoodOrderOut)
def create_public_food_order(order_data: FoodOrderCreate, db: Session = Depends(get_db)):
    """Create a food order anonymously from a guest room or restaurant table"""
    try:
        from app.curd import foodorder as food_order_crud
        from app.models.room import Room
        from app.models.restaurant_table import RestaurantTable
        
        # Resolve branch_id from room or table
        branch_id = 1 # Fallback
        if order_data.room_id:
            room = db.query(Room).filter(Room.id == order_data.room_id).first()
            if room:
                branch_id = room.branch_id
        elif order_data.table_id:
            table = db.query(RestaurantTable).filter(RestaurantTable.id == order_data.table_id).first()
            if table:
                branch_id = table.branch_id
                
        new_order = food_order_crud.create_food_order(db, order_data, branch_id=branch_id)
        return new_order
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to place food order: {str(e)}")


# Public anonymous service request endpoint
@router.post("/service-requests", response_model=ServiceRequestOut)
def create_public_service_request(request_data: ServiceRequestCreate, db: Session = Depends(get_db)):
    """Create a service request anonymously from a guest room"""
    try:
        from app.curd import service_request as service_request_crud
        from app.models.room import Room
        
        # Resolve branch_id from room
        branch_id = 1 # Fallback
        if request_data.room_id:
            room = db.query(Room).filter(Room.id == request_data.room_id).first()
            if room:
                branch_id = room.branch_id
                
        new_request = service_request_crud.create_service_request(db, request_data, branch_id=branch_id)
        return new_request
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to submit service request: {str(e)}")

