from sqlalchemy.orm import Session
from datetime import date, timedelta
import logging

from app.database import SessionLocal
from app.models.room import RoomType, Room
from app.models.booking import Booking, BookingRoom
from app.models.Package import PackageBooking, PackageBookingRoom
from app.core.aiosell_client import push_inventory, push_rate, batch_push_inventory, batch_push_rates
from app.utils.aiosell_config import is_aiosell_active

logger = logging.getLogger(__name__)

def _calculate_availability_for_date(db: Session, room_type_id: int, target_date: date, branch_id: int = None) -> int:
    """
    Calculates OTA-facing availability for a room type on a given night.

    Logic:
      - physical_available  = (total_inventory or physical count) - total_bookings
      - If online_inventory is set:
          ota_available = online_inventory - total_bookings
          pushed value  = min(ota_available, physical_available)  [can't exceed physical]
      - If online_inventory is NOT set: fall back to physical_available

    Example: 10 physical rooms, online_inventory=8, 1 booking
      → physical_available = 9, ota_available = 7  → Aiosell gets 7
    """
    room_type = db.query(RoomType).filter(RoomType.id == room_type_id).first()
    if not room_type: return 0

    # Resolve branch_id: use passed value, fallback to room_type's branch
    effective_branch = branch_id if branch_id is not None else room_type.branch_id

    # 1. Physical room count (non-deleted and NOT in Maintenance)
    total_physical = db.query(Room).filter(
        Room.room_type_id == room_type_id,
        Room.branch_id == effective_branch,
        Room.status.notin_(["Deleted", "Maintenance", "Out of Order"])
    ).count()

    # Internal capacity: use the actual physical room count (non-deleted, non-maintenance)
    capacity = total_physical

    # Active booking statuses
    ACTIVE_STATUSES = ["Booked", "booked", "checked-in", "Checked-in", "Confirmed", "confirmed", "Occupied", "occupied"]

    # 2. Regular Hard allocations
    assigned_overlaps = db.query(BookingRoom).join(Booking).join(Room).filter(
        Room.room_type_id == room_type_id,
        Booking.branch_id == effective_branch,
        Booking.status.in_(ACTIVE_STATUSES),
        Booking.check_in <= target_date,
        Booking.check_out > target_date
    ).count()

    # 3. Regular Soft allocations
    from sqlalchemy import func, or_, and_
    from app.models.Package import Package  # Import Package model here if needed
    
    bookings_of_type = db.query(Booking).filter(
        Booking.room_type_id == room_type_id,
        Booking.branch_id == effective_branch,
        Booking.status.in_(ACTIVE_STATUSES),
        Booking.check_in <= target_date,
        Booking.check_out > target_date
    ).all()

    soft_remainder = 0
    for b in bookings_of_type:
        num_assigned_this_type = db.query(BookingRoom).join(Room).filter(
            BookingRoom.booking_id == b.id,
            Room.room_type_id == room_type_id
        ).count()
        soft_remainder += max(0, (b.num_rooms or 1) - num_assigned_this_type)

    # 4. Package Hard allocations
    assigned_packages = db.query(PackageBookingRoom).join(PackageBooking).join(Room).filter(
        Room.room_type_id == room_type_id,
        PackageBooking.branch_id == effective_branch,
        PackageBooking.status.in_(ACTIVE_STATUSES),
        PackageBooking.check_in <= target_date,
        PackageBooking.check_out > target_date
    ).count()

    # 5. Package Soft allocations & Whole Property blocking
    package_bookings = db.query(PackageBooking).join(Package).filter(
        PackageBooking.branch_id == effective_branch,
        PackageBooking.status.in_(ACTIVE_STATUSES),
        PackageBooking.check_in <= target_date,
        PackageBooking.check_out > target_date
    ).all()

    soft_package_remainder = 0
    for pb in package_bookings:
        # If any whole property package is booked, everything is blocked
        if pb.package.booking_type == "whole_property":
            return 0
            
        # Check if this package is relevant to this room type
        is_relevant = False
        if pb.package.room_types:
            allowed_types = [t.strip() for t in pb.package.room_types.split(",")]
            if str(room_type_id) in allowed_types:
                is_relevant = True
        
        if is_relevant:
            num_assigned_this_type = db.query(PackageBookingRoom).join(Room).filter(
                PackageBookingRoom.package_booking_id == pb.id,
                Room.room_type_id == room_type_id
            ).count()
            soft_package_remainder += max(0, (pb.num_rooms or 1) - num_assigned_this_type)
    
    total_bookings = assigned_overlaps + soft_remainder + assigned_packages + soft_package_remainder

    # Physical availability (internal view)
    physical_available = max(0, capacity - total_bookings)

    # OTA quota logic (Pool System):
    #   None  → not configured, fall back to physical availability
    #   0     → explicit stop-sell, push 0 to CM
    #   N > 0 → Dedicated OTA pool. All bookings (Local + OTA) consume from this pool.
    #           Ensures that a buffer of (Capacity - N) is always kept for PMS.
    if room_type.online_inventory is not None:
        if room_type.online_inventory <= 0:
            return 0  # Explicitly set to 0 = stop sell on OTA
        
        # Calculate availability based on the OTA pool limit
        ota_available = max(0, room_type.online_inventory - total_bookings)
        
        # Result is the lesser of the OTA pool remainder and actual physical availability
        return max(0, min(ota_available, physical_available))

    # online_inventory not configured — expose full physical availability
    return physical_available


def trigger_inventory_push(room_type_id: int, days: int = 180):
    """
    Calculates availability and PUSHES directly to Aiosell.
    Designed to be run as a BackgroundTask.
    """
    if not is_aiosell_active():
        return

    db = SessionLocal()
    try:
        room_type = db.query(RoomType).filter(RoomType.id == room_type_id).first()
        if not room_type:
            print(f"[AIOSELL DEBUG] Inventory Push aborted: RoomType {room_type_id} not found")
            return
            
        if not room_type.channel_manager_id:
            print(f"[AIOSELL DEBUG] Inventory Push aborted: RoomType {room_type.name} has no CM mapping")
            return
            
        print(f"[AIOSELL DEBUG] Starting Inventory Push for {room_type.name} ({room_type.channel_manager_id})")
        
        start_date = date.today()
        batch_data = []
        current_qty = -1
        segment_start = None
        
        for i in range(days):
            target_date = start_date + timedelta(days=i)
            available = _calculate_availability_for_date(db, room_type_id, target_date)

            # Group consecutive dates with same availability into a single range
            if available != current_qty:
                if segment_start is not None:
                    batch_data.append({
                        "room_code": room_type.channel_manager_id,
                        "qty": current_qty,
                        "start_date": segment_start,
                        "end_date": target_date - timedelta(days=1)
                    })
                segment_start = target_date
                current_qty = available

        # Flush the last segment
        if segment_start is not None:
            batch_data.append({
                "room_code": room_type.channel_manager_id,
                "qty": current_qty,
                "start_date": segment_start,
                "end_date": start_date + timedelta(days=days - 1)
            })
            
        from app.models.branch import Branch
        branch_hotel_code = None
        if room_type.branch_id:
            br = db.query(Branch).filter(Branch.id == room_type.branch_id).first()
            if br and br.code:
                branch_hotel_code = br.code

        if batch_data:
            success = batch_push_inventory(batch_data, hotel_code=branch_hotel_code)
            status = "SUCCESS" if success else "FAILED"
            print(f"[AIOSELL DEBUG] Inventory Push {status} for {room_type.name} (Hotel Code: {branch_hotel_code}, {len(batch_data)} segments)")
            logger.info(f"[AIOSELL TRIGGER] Pushed inventory for {room_type.name} ({room_type.channel_manager_id}) hotel_code={branch_hotel_code} for {days} days. Result: {status}")
    except Exception as e:
        print(f"[AIOSELL ERROR] trigger_inventory_push failed: {e}")
        logger.error(f"Aiosell inventory trigger error: {e}")
    finally:
        db.close()


def trigger_rates_push(room_type_id: int, days: int = 90):
    """
    Pushes dynamic rates for the next X days DIRECTLY to Aiosell.
    Considers:
    1. Base Price
    2. Weekend Price (Fri/Sat nights)
    3. Holiday/Long Weekend overrides from Pricing Calendar
    """
    if not is_aiosell_active():
        return

    db = SessionLocal()
    try:
        from app.models.room import RatePlan
        from app.models.calendar import PricingCalendar
        from app.core.aiosell_client import batch_push_rates
        
        room_type = db.query(RoomType).filter(RoomType.id == room_type_id).first()
        if not room_type:
            print(f"[AIOSELL DEBUG] Rates Push aborted: RoomType {room_type_id} not found")
            return
            
        if not room_type.channel_manager_id:
            print(f"[AIOSELL DEBUG] Rates Push aborted: RoomType {room_type.name} has no CM mapping")
            return

        # Fetch dynamic rate plans
        rate_plans = db.query(RatePlan).filter(RatePlan.room_type_id == room_type_id).all()
        if not rate_plans:
            # Fallback legacy logic if no dynamic plans exist
            rate_plans = [RatePlan(channel_manager_id=f"{room_type.channel_manager_id}-S-101", price_offset=0)]

        print(f"[AIOSELL DEBUG] Starting Dynamic Rate Push for {room_type.name} for {days} days")
        
        start_date = date.today()
        end_date = start_date + timedelta(days=days)
        
        # Fetch all pricing overrides for the range
        overrides = db.query(PricingCalendar).filter(
            PricingCalendar.end_date >= start_date,
            PricingCalendar.start_date <= end_date
        ).all()

        from app.models.branch import Branch
        branch_hotel_code = None
        if room_type.branch_id:
            br = db.query(Branch).filter(Branch.id == room_type.branch_id).first()
            if br and br.code:
                branch_hotel_code = br.code

        for plan in rate_plans:
            if not plan.channel_manager_id: continue
            
            batch_data = []
            current_rate = -1
            segment_start = None
            
            for i in range(days + 1):
                target_date = start_date + timedelta(days=i)
                
                # 1. Determine Day Type (Prioritize HOLIDAY)
                day_type = None
                day_overrides = [ov for ov in overrides if ov.start_date <= target_date <= ov.end_date]
                if day_overrides:
                    # Sort to ensure HOLIDAY > LONG_WEEKEND > others
                    priority = {"HOLIDAY": 0, "LONG_WEEKEND": 1, "WEEKEND": 2, "WEEKDAY": 3}
                    day_overrides.sort(key=lambda x: priority.get(x.day_type, 99))
                    day_type = day_overrides[0].day_type
                
                # 2. Calculate Daily Base for this RoomType
                if day_type == "HOLIDAY" and room_type.holiday_price:
                    daily_base = room_type.holiday_price
                elif day_type == "LONG_WEEKEND" and room_type.long_weekend_price:
                    daily_base = room_type.long_weekend_price
                elif day_type == "WEEKEND":
                    daily_base = room_type.weekend_price if room_type.weekend_price else (room_type.base_price or 0.0)
                elif day_type == "WEEKDAY":
                    daily_base = room_type.base_price or 0.0
                else:
                    # Default Weekend Logic: Friday (4) and Saturday (5)
                    is_weekend = target_date.weekday() in [4, 5]
                    if is_weekend and room_type.weekend_price:
                        daily_base = room_type.weekend_price
                    else:
                        daily_base = room_type.base_price or 0.0
                
                # 3. Apply Plan-specific logic
                if plan.base_price and plan.base_price > 0:
                    # Plan has a fixed price that overrides everything? 
                    # Usually offsets are better for dynamic pricing.
                    # If plan.base_price is set, we use it, but maybe we should still apply day-type?
                    # For now, let's assume if plan.base_price is set, it's a fixed rate.

                    rate = plan.base_price
                else:
                    rate = daily_base + (plan.price_offset or 0)

                # Extract extra adult & child rates from plan or room_type
                extra_adult = (plan.extra_adult_price if plan.extra_adult_price is not None else getattr(room_type, 'extra_adult_price', 0.0)) or 0.0
                extra_child = (plan.extra_child_price if plan.extra_child_price is not None else getattr(room_type, 'extra_child_price', 0.0)) or 0.0

                # Group consecutive dates with same rate to minimize payload size
                if rate != current_rate:
                    if segment_start:
                        batch_data.append({
                            "room_code": room_type.channel_manager_id,
                            "rate": current_rate,
                            "start_date": segment_start,
                            "end_date": target_date - timedelta(days=1),
                            "rate_plan_code": plan.channel_manager_id,
                            "extra_adult": extra_adult,
                            "extra_child": extra_child
                        })
                    segment_start = target_date
                    current_rate = rate
            
            # Add final segment
            if segment_start:
                extra_adult = (plan.extra_adult_price if plan.extra_adult_price is not None else getattr(room_type, 'extra_adult_price', 0.0)) or 0.0
                extra_child = (plan.extra_child_price if plan.extra_child_price is not None else getattr(room_type, 'extra_child_price', 0.0)) or 0.0
                batch_data.append({
                    "room_code": room_type.channel_manager_id,
                    "rate": current_rate,
                    "start_date": segment_start,
                    "end_date": start_date + timedelta(days=days),
                    "rate_plan_code": plan.channel_manager_id,
                    "extra_adult": extra_adult,
                    "extra_child": extra_child
                })

            if batch_data:
                success = batch_push_rates(batch_data, hotel_code=branch_hotel_code)
                status = "SUCCESS" if success else "FAILED"
                print(f"[AIOSELL DEBUG] Batch Rate Push {status} for Plan {plan.channel_manager_id} (Hotel Code: {branch_hotel_code})")
            
        logger.info(f"[AIOSELL TRIGGER] Pushed dynamic rates for {room_type.name} ({len(rate_plans)} plans) hotel_code={branch_hotel_code} for {days} days")


    except Exception as e:
        print(f"[AIOSELL ERROR] trigger_rates_push failed: {e}")
        logger.error(f"Aiosell rates trigger error: {e}")
    finally:
        db.close()


def trigger_restrictions_push(room_type_id: int, stop_sell: bool = False, min_stay: int = None, max_stay: int = None):
    """
    Pushes Stop Sell and other restrictions directly to Aiosell.
    Designed to be run as a BackgroundTask.
    """
    if not is_aiosell_active():
        return

    db = SessionLocal()
    try:
        room_type = db.query(RoomType).filter(RoomType.id == room_type_id).first()
        if not room_type:
            print(f"[AIOSELL DEBUG] Restriction Push aborted: RoomType {room_type_id} not found")
            return
            
        if not room_type.channel_manager_id:
            print(f"[AIOSELL DEBUG] Restriction Push aborted: RoomType {room_type.name} has no CM mapping")
            return
            
        print(f"[AIOSELL DEBUG] Starting Restriction Push for {room_type.name} ({room_type.channel_manager_id}), StopSell={stop_sell}")
        
        from app.models.branch import Branch
        branch_hotel_code = None
        if room_type.branch_id:
            br = db.query(Branch).filter(Branch.id == room_type.branch_id).first()
            if br and br.code:
                branch_hotel_code = br.code

        from app.core.aiosell_client import push_restriction
        start = date.today()
        # Push restrictions for the next 180 days as per Aiosell best practices
        end = start + timedelta(days=180)
        
        success = push_restriction(
            room_code=room_type.channel_manager_id,
            start_date=start,
            end_date=end,
            stop_sell=stop_sell,
            min_stay=min_stay,
            max_stay=max_stay,
            hotel_code=branch_hotel_code
        )
        status = "SUCCESS" if success else "FAILED"
        print(f"[AIOSELL DEBUG] Restriction Push {status} for {room_type.name}")
        logger.info(f"[AIOSELL TRIGGER] Pushed restrictions for {room_type.name}. StopSell={stop_sell}. Result: {status}")
    except Exception as e:
        print(f"[AIOSELL ERROR] trigger_restrictions_push failed: {e}")
        logger.error(f"Aiosell restriction trigger error: {e}")
    finally:
        db.close()
