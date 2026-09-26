from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.models.calendar import PricingCalendar
from app.models.room import RoomType
from app.schemas.calendar import PricingCalendarCreate, PricingCalendarUpdate, PricingCalendarOut
from app.utils.branch_scope import get_branch_id
from typing import List, Optional
from datetime import date

router = APIRouter(tags=["Pricing Calendar"])


def _trigger_all_room_rates():
    """
    Fetches all room types that have a channel manager mapping and triggers
    an Aiosell rate push for each one in the background.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        from app.core.aiosell_triggers import trigger_rates_push
        room_types = db.query(RoomType).filter(
            RoomType.channel_manager_id.isnot(None),
            RoomType.channel_manager_id != ""
        ).all()

        if not room_types:
            print("[AIOSELL] No room types with CM mapping found. Skipping rate push.")
            return

        print(f"[AIOSELL] Pricing Calendar changed — pushing rates for {len(room_types)} room type(s).")
        for rt in room_types:
            try:
                # Use a large enough window to cover the calendar changes
                trigger_rates_push(rt.id, days=180)
            except Exception as e:
                print(f"[AIOSELL ERROR] Failed to push rates for room type {rt.id} ({rt.name}): {e}")
    except Exception as e:
        print(f"[AIOSELL ERROR] _trigger_all_room_rates failed: {e}")
    finally:
        db.close()


@router.post("", response_model=PricingCalendarOut)
@router.post("/", response_model=PricingCalendarOut)
def create_calendar_entry(
    entry: PricingCalendarCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Depends(get_branch_id)
):
    if entry.start_date > entry.end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date.")
    
    entry_data = entry.model_dump()
    if branch_id is not None:
        entry_data["branch_id"] = branch_id

    new_entry = PricingCalendar(**entry_data)
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    # Push updated rates to Aiosell for all mapped room types
    background_tasks.add_task(_trigger_all_room_rates)

    return new_entry


@router.get("", response_model=List[PricingCalendarOut])
@router.get("/", response_model=List[PricingCalendarOut])
def get_calendar_entries(
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Depends(get_branch_id)
):
    query = db.query(PricingCalendar)
    if branch_id is not None:
        query = query.filter(or_(PricingCalendar.branch_id == branch_id, PricingCalendar.branch_id == None))
    return query.all()


@router.get("/{entry_id}", response_model=PricingCalendarOut)
def get_calendar_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Depends(get_branch_id)
):
    query = db.query(PricingCalendar).filter(PricingCalendar.id == entry_id)
    if branch_id is not None:
        query = query.filter(or_(PricingCalendar.branch_id == branch_id, PricingCalendar.branch_id == None))
    db_entry = query.first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return db_entry


@router.put("/{entry_id}", response_model=PricingCalendarOut)
def update_calendar_entry(
    entry_id: int,
    entry: PricingCalendarUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Depends(get_branch_id)
):
    query = db.query(PricingCalendar).filter(PricingCalendar.id == entry_id)
    if branch_id is not None:
        query = query.filter(or_(PricingCalendar.branch_id == branch_id, PricingCalendar.branch_id == None))
    db_entry = query.first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found.")

    update_data = entry.model_dump(exclude_unset=True)
    if branch_id is not None:
        update_data["branch_id"] = branch_id
    for key, value in update_data.items():
        setattr(db_entry, key, value)

    db.commit()
    db.refresh(db_entry)

    # Push updated rates to Aiosell for all mapped room types
    background_tasks.add_task(_trigger_all_room_rates)

    return db_entry


@router.delete("/{entry_id}", response_model=dict)
def delete_calendar_entry(
    entry_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    branch_id: Optional[int] = Depends(get_branch_id)
):
    query = db.query(PricingCalendar).filter(PricingCalendar.id == entry_id)
    if branch_id is not None:
        query = query.filter(PricingCalendar.branch_id == branch_id)
    db_entry = query.first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found or access denied.")

    db.delete(db_entry)
    db.commit()

    # Push updated rates to Aiosell for all mapped room types (reverts holiday pricing)
    background_tasks.add_task(_trigger_all_room_rates)

    return {"message": "Entry deleted successfully"}

