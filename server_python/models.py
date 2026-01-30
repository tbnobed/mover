from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class FileState(str, Enum):
    DETECTED = "detected"
    VALIDATED = "validated"
    QUEUED = "queued"
    TRANSFERRING = "transferring"
    TRANSFERRED = "transferred"
    COLORIST_ASSIGNED = "colorist_assigned"
    IN_PROGRESS = "in_progress"
    DELIVERED_TO_MAM = "delivered_to_mam"
    ARCHIVED = "archived"
    REJECTED = "rejected"

class UserRole(str, Enum):
    ADMIN = "admin"
    COLORIST = "colorist"
    ENGINEER = "engineer"
    READONLY = "readonly"

class FileCreate(BaseModel):
    filename: str
    source_site: str
    source_path: str
    file_size: int
    sha256_hash: str

class FileResponse(BaseModel):
    id: str
    filename: str
    source_site: str
    source_path: str
    file_size: int
    sha256_hash: str
    state: str
    assigned_to: Optional[str] = None
    raysync_job_id: Optional[str] = None
    transfer_progress: int = 0
    error_message: Optional[str] = None
    detected_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None
    transfer_started_at: Optional[datetime] = None
    transfer_completed_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    displayName: str
    password: Optional[str] = None
    email: Optional[str] = None
    role: str = "colorist"

class UserUpdate(BaseModel):
    username: Optional[str] = None
    displayName: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    username: str
    displayName: str
    email: Optional[str] = None
    role: str
    createdAt: Optional[datetime] = None

class SiteCreate(BaseModel):
    name: str
    exportPath: str

class SiteUpdate(BaseModel):
    name: Optional[str] = None
    exportPath: Optional[str] = None
    isActive: Optional[str] = None

class SiteResponse(BaseModel):
    id: str
    name: str
    export_path: str
    is_active: str
    last_heartbeat: Optional[datetime] = None

class AuditLogResponse(BaseModel):
    id: str
    file_id: Optional[str] = None
    action: str
    previous_state: Optional[str] = None
    new_state: Optional[str] = None
    performed_by: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[str] = None
    created_at: Optional[datetime] = None

class TransferJobResponse(BaseModel):
    id: str
    file_id: str
    raysync_job_id: Optional[str] = None
    source_site: str
    destination_site: str
    status: str
    progress: int = 0
    bytes_transferred: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

class StatsResponse(BaseModel):
    total_files: int
    detected: int
    validated: int
    queued: int
    transferring: int
    transferred: int
    assigned: int
    in_progress: int
    delivered: int
    archived: int
    rejected: int

class AssignRequest(BaseModel):
    user_id: Optional[str] = None

class RejectRequest(BaseModel):
    reason: Optional[str] = None
