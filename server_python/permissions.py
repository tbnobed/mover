"""
Role-based permission system for Color Routing System.

Roles:
- admin: Full access to everything
- colorist: Full workflow access, cannot manage users
- media_manager: Full workflow except assigning colorists, cannot manage users
- engineer: View-only plus validate files and trigger retransfers
- readonly: View-only (dashboard, files, status, audit logs)
"""

from typing import Set

# Define permissions as constants
VIEW_FILES = "view_files"
VIEW_AUDIT = "view_audit"
VALIDATE_FILES = "validate_files"
ASSIGN_COLORIST = "assign_colorist"
START_WORK = "start_work"
DELIVER_MAM = "deliver_mam"
REJECT_FILES = "reject_files"
ARCHIVE_FILES = "archive_files"
REVERT_STATE = "revert_state"
TRIGGER_CLEANUP = "trigger_cleanup"
TRIGGER_RETRANSFER = "trigger_retransfer"
DELETE_FILES = "delete_files"
MANAGE_USERS = "manage_users"

# Role to permissions mapping
ROLE_PERMISSIONS: dict[str, Set[str]] = {
    "admin": {
        VIEW_FILES, VIEW_AUDIT, VALIDATE_FILES, ASSIGN_COLORIST,
        START_WORK, DELIVER_MAM, REJECT_FILES, ARCHIVE_FILES,
        REVERT_STATE, TRIGGER_CLEANUP, TRIGGER_RETRANSFER,
        DELETE_FILES, MANAGE_USERS
    },
    "colorist": {
        VIEW_FILES, VIEW_AUDIT, VALIDATE_FILES, ASSIGN_COLORIST,
        START_WORK, DELIVER_MAM, REJECT_FILES, ARCHIVE_FILES,
        REVERT_STATE, TRIGGER_CLEANUP, TRIGGER_RETRANSFER,
        DELETE_FILES
    },
    "media_manager": {
        VIEW_FILES, VIEW_AUDIT, VALIDATE_FILES,
        START_WORK, DELIVER_MAM, REJECT_FILES, ARCHIVE_FILES,
        REVERT_STATE, TRIGGER_CLEANUP, TRIGGER_RETRANSFER,
        DELETE_FILES
    },
    "engineer": {
        VIEW_FILES, VIEW_AUDIT, VALIDATE_FILES, TRIGGER_RETRANSFER
    },
    "readonly": {
        VIEW_FILES, VIEW_AUDIT
    }
}

def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    permissions = ROLE_PERMISSIONS.get(role, set())
    return permission in permissions

def get_permissions(role: str) -> Set[str]:
    """Get all permissions for a role."""
    return ROLE_PERMISSIONS.get(role, set())

def require_permission(user: dict, permission: str) -> None:
    """Raise an exception if the user doesn't have the required permission."""
    from fastapi import HTTPException
    
    role = user.get("role", "readonly")
    if not has_permission(role, permission):
        raise HTTPException(
            status_code=403, 
            detail=f"Permission denied: {permission} requires role with higher privileges"
        )
