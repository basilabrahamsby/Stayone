from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.schemas.user import RoleCreate, RoleOut
from app.curd import role as crud_role
from app.models.user import User
from app.utils.auth import get_current_user
from app.utils.branch_scope import get_branch_id
from typing import Optional

router = APIRouter(prefix="/roles", tags=["Roles"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_role_permission(user: User):
    if getattr(user, "is_superadmin", False):
        return True
    if user.tenant_id is not None:
        return True
    if user.role and user.role.name:
        role_lower = user.role.name.lower()
        if any(kw in role_lower for kw in ["admin", "superadmin", "owner", "manager", "prop"]):
            return True
    if user.branch_id is not None:
        return True
    raise HTTPException(status_code=403, detail="Only hotel owner, branch admin or superadmin can perform this action")

def get_effective_branch_id(user: User, scoped_branch_id: Optional[int]) -> Optional[int]:
    is_global_super = getattr(user, "is_superadmin", False) and user.branch_id is None
    if is_global_super and scoped_branch_id is None:
        return None
    return scoped_branch_id if scoped_branch_id is not None else user.branch_id

@router.post("", response_model=RoleOut)
def create_new_role(
    role: RoleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    scoped_branch_id: Optional[int] = Depends(get_branch_id)
):
    check_role_permission(user)
    target_branch_id = get_effective_branch_id(user, scoped_branch_id)
    try:
        return crud_role.create_role(db, role, branch_id=target_branch_id)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@router.post("/", response_model=RoleOut)  # Handle trailing slash
def create_new_role_slash(
    role: RoleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    scoped_branch_id: Optional[int] = Depends(get_branch_id)
):
    check_role_permission(user)
    target_branch_id = get_effective_branch_id(user, scoped_branch_id)
    return crud_role.create_role(db, role, branch_id=target_branch_id)

@router.get("", response_model=list[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scoped_branch_id: Optional[int] = Depends(get_branch_id),
    skip: int = 0,
    limit: int = 100
):
    is_global_super = getattr(current_user, "is_superadmin", False) and current_user.branch_id is None
    if is_global_super and scoped_branch_id is None:
        return crud_role.get_roles(db, skip=skip, limit=limit, branch_id=None)
    
    target_branch_id = get_effective_branch_id(current_user, scoped_branch_id)
    return crud_role.get_roles(db, skip=skip, limit=limit, branch_id=target_branch_id)

@router.put("/{role_id}", response_model=RoleOut)
def update_existing_role(
    role_id: int,
    role: RoleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    scoped_branch_id: Optional[int] = Depends(get_branch_id)
):
    check_role_permission(user)
    target_branch_id = get_effective_branch_id(user, scoped_branch_id)
    updated_role = crud_role.update_role(db, role_id, role, branch_id=target_branch_id)
    if not updated_role:
        raise HTTPException(status_code=404, detail="Role not found in this branch")
    return updated_role

@router.delete("/{role_id}")
def delete_existing_role(
    role_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    scoped_branch_id: Optional[int] = Depends(get_branch_id)
):
    check_role_permission(user)
    target_branch_id = get_effective_branch_id(user, scoped_branch_id)
    success = crud_role.delete_role(db, role_id, branch_id=target_branch_id)
    if not success:
        raise HTTPException(status_code=404, detail="Role not found in this branch")
    return {"message": "Role deleted successfully"}
