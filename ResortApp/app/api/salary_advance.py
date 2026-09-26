from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone
from pydantic import BaseModel

from app.utils.auth import get_db, get_current_user
from app.models.salary_advance import SalaryAdvance
from app.models.employee import Employee
from app.models.user import User
from app.utils.branch_scope import get_branch_id
from app.utils.accounting_helpers import (
    create_salary_advance_journal_entry,
    create_salary_advance_deduction_journal_entry,
)

router = APIRouter(prefix="/salary-advances", tags=["Salary Advances"])


# --- Schemas ---
class SalaryAdvanceCreate(BaseModel):
    employee_id: int
    amount: float
    date: date
    reason: Optional[str] = None
    deduct_month: int
    deduct_year: int
    payment_method: Optional[str] = "cash"
    issued_by: Optional[str] = None
    notes: Optional[str] = None


class SalaryAdvanceUpdate(BaseModel):
    status: Optional[str] = None   # pending | deducted
    notes: Optional[str] = None


class SalaryAdvanceOut(BaseModel):
    id: int
    employee_id: int
    amount: float
    date: date
    reason: Optional[str] = None
    deduct_month: int
    deduct_year: int
    status: str
    payment_method: Optional[str] = None
    issued_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# --- Endpoints ---

@router.post("/", response_model=SalaryAdvanceOut)
def create_salary_advance(
    advance: SalaryAdvanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: int = Depends(get_branch_id)
):
    """Record a new salary advance for an employee."""
    employee = db.query(Employee).filter(Employee.id == advance.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if branch_id is not None and employee.branch_id != branch_id:
        raise HTTPException(status_code=403, detail="Employee does not belong to your branch")

    # Validate month range
    if not (1 <= advance.deduct_month <= 12):
        raise HTTPException(status_code=400, detail="deduct_month must be between 1 and 12")

    new_advance = SalaryAdvance(
        employee_id=advance.employee_id,
        branch_id=branch_id if branch_id is not None else employee.branch_id,
        amount=advance.amount,
        date=advance.date,
        reason=advance.reason,
        deduct_month=advance.deduct_month,
        deduct_year=advance.deduct_year,
        payment_method=advance.payment_method,
        issued_by=advance.issued_by or current_user.name or current_user.email,
        notes=advance.notes,
        status="pending"
    )
    db.add(new_advance)
    db.commit()
    db.refresh(new_advance)

    # ── Accounting: Debit Staff Loans & Advances / Credit Cash or Bank ───
    try:
        eff_branch = new_advance.branch_id or (employee.branch_id if employee else 1) or 1
        create_salary_advance_journal_entry(
            db=db,
            advance_id=new_advance.id,
            amount=new_advance.amount,
            employee_name=employee.name,
            payment_method=new_advance.payment_method or "cash",
            branch_id=eff_branch,
            created_by=current_user.id
        )
    except Exception as e:
        print(f"[WARNING] Salary advance journal entry skipped: {e}")

    return new_advance


@router.get("/employee/{employee_id}", response_model=List[SalaryAdvanceOut])
def get_advances_for_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: int = Depends(get_branch_id)
):
    """Get all salary advances for a specific employee."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if branch_id is not None and employee.branch_id != branch_id:
        raise HTTPException(status_code=403, detail="Employee does not belong to your branch")

    query = db.query(SalaryAdvance).filter(SalaryAdvance.employee_id == employee_id)
    if branch_id is not None:
        query = query.filter(SalaryAdvance.branch_id == branch_id)
    return query.order_by(SalaryAdvance.date.desc()).all()


@router.get("/employee/{employee_id}/month/{year}/{month}", response_model=List[SalaryAdvanceOut])
def get_advances_for_month(
    employee_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: int = Depends(get_branch_id)
):
    """Get salary advances that are scheduled for deduction in a specific month."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if branch_id is not None and employee.branch_id != branch_id:
        raise HTTPException(status_code=403, detail="Employee does not belong to your branch")

    query = db.query(SalaryAdvance).filter(
        SalaryAdvance.employee_id == employee_id,
        SalaryAdvance.deduct_year == year,
        SalaryAdvance.deduct_month == month
    )
    if branch_id is not None:
        query = query.filter(SalaryAdvance.branch_id == branch_id)
    return query.all()


@router.put("/{advance_id}", response_model=SalaryAdvanceOut)
def update_advance_status(
    advance_id: int,
    update: SalaryAdvanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: int = Depends(get_branch_id)
):
    """Mark an advance as deducted or update notes."""
    query = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id)
    if branch_id is not None:
        query = query.filter(SalaryAdvance.branch_id == branch_id)
    advance = query.first()
    if not advance:
        raise HTTPException(status_code=404, detail="Salary advance not found or access denied")

    was_pending = advance.status == "pending"

    if update.status is not None:
        if update.status not in ("pending", "deducted"):
            raise HTTPException(status_code=400, detail="status must be 'pending' or 'deducted'")
        advance.status = update.status
    if update.notes is not None:
        advance.notes = update.notes

    db.commit()
    db.refresh(advance)

    # ── Accounting: when advance is marked as deducted ────────────────────
    if update.status == "deducted" and was_pending:
        try:
            employee = db.query(Employee).filter(Employee.id == advance.employee_id).first()
            eff_branch = advance.branch_id or (employee.branch_id if employee else 1) or 1
            create_salary_advance_deduction_journal_entry(
                db=db,
                advance_id=advance.id,
                amount=advance.amount,
                employee_name=employee.name if employee else f"Employee #{advance.employee_id}",
                branch_id=eff_branch,
                created_by=current_user.id
            )
        except Exception as e:
            print(f"[WARNING] Salary advance deduction journal entry skipped: {e}")

    return advance


@router.delete("/{advance_id}")
def delete_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch_id: int = Depends(get_branch_id)
):
    """Delete a salary advance record."""
    query = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id)
    if branch_id is not None:
        query = query.filter(SalaryAdvance.branch_id == branch_id)
    advance = query.first()
    if not advance:
        raise HTTPException(status_code=404, detail="Salary advance not found or access denied")
    db.delete(advance)
    db.commit()
    return {"message": "Advance deleted successfully"}

