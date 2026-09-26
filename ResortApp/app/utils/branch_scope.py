from fastapi import Depends, HTTPException, Header, Request, status
from typing import Optional
from sqlalchemy.orm import Session
from app.utils.auth import get_current_user, get_db
from app.models.user import User

def get_branch_id(
    request: Request,
    current_user: User = Depends(get_current_user),
    x_branch_id: Optional[str] = Header(None, alias="X-Branch-ID"),
    db: Session = Depends(get_db)
) -> Optional[int]:
    """
    Dependency to get the branch_id for scoping data:
    - Global Platform SuperAdmin (is_superadmin=True and branch_id is None):
        Can view all branches (X-Branch-ID: all -> None) or switch to any specific branch.
    - Branch Admin / Staff (has branch_id or is_superadmin=False):
        LOCKED to their assigned branch_id ONLY.
    - Strict validation: If the property (tenant) or branch is disabled, NO access is permitted!
    """
    is_global_superadmin = getattr(current_user, "is_superadmin", False) and current_user.branch_id is None

    if is_global_superadmin:
        if x_branch_id is not None:
            if x_branch_id.lower() == 'all':
                return None  # Enterprise view across all branches
            try:
                return int(x_branch_id)
            except ValueError:
                pass
        return None  # Default for superadmin is enterprise view

    # Branch admin or employee is strictly locked to their corresponding branch
    if current_user.branch_id is not None:
        user_branch = current_user.branch
        if not user_branch or not user_branch.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Branch '{user_branch.name if user_branch else current_user.branch_id}' has been disabled by platform administration."
            )
        if user_branch.tenant and not user_branch.tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Property workspace '{user_branch.tenant.name}' has been disabled by platform administration."
            )
        return current_user.branch_id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="User is not assigned to any branch."
    )
