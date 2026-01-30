import os
import sys
import hashlib
import aiofiles
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware

STORAGE_PATH = os.environ.get("STORAGE_PATH", "./data/incoming")
os.makedirs(STORAGE_PATH, exist_ok=True)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
import uvicorn

from database import get_pool, close_pool
from models import (
    FileCreate, FileResponse, LoginRequest, UserCreate, UserUpdate, UserResponse, SiteResponse,
    AuditLogResponse, TransferJobResponse, StatsResponse, AssignRequest, RejectRequest
)
import storage

@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()

app = FastAPI(title="Color Routing System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def snake_to_camel(data):
    if isinstance(data, dict):
        return {
            ''.join(word.capitalize() if i > 0 else word for i, word in enumerate(k.split('_'))): snake_to_camel(v)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [snake_to_camel(item) for item in data]
    return data

async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await storage.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    
    return session

def is_production():
    return os.environ.get("NODE_ENV") == "production" or os.environ.get("PRODUCTION") == "true"

DAEMON_API_KEY = os.environ.get("DAEMON_API_KEY", "")

async def get_daemon_or_user_auth(request: Request):
    api_key = request.headers.get("X-API-Key")
    if DAEMON_API_KEY and api_key == DAEMON_API_KEY:
        return {"type": "daemon", "daemon": True}
    
    token = request.cookies.get("session_token")
    if token:
        session = await storage.get_session(token)
        if session:
            return {"type": "user", **session}
    
    raise HTTPException(status_code=401, detail="Authentication required")

@app.post("/api/auth/login")
async def login(login_data: LoginRequest, response: Response):
    user = await storage.verify_password(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = await storage.create_session(user["id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=is_production(),
        max_age=7 * 24 * 60 * 60,
        samesite="lax"
    )
    
    return {
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "displayName": user["display_name"],
            "role": user["role"],
            "email": user["email"]
        }
    }

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await storage.delete_session(token)
    response.delete_cookie(key="session_token")
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await storage.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    
    return {
        "id": session["user_id"],
        "username": session["username"],
        "displayName": session["display_name"],
        "role": session["role"],
        "email": session["email"]
    }

@app.get("/api/stats")
async def get_stats(_user: dict = Depends(get_current_user)):
    stats = await storage.get_stats()
    return {
        "totalFiles": stats["total_files"],
        "detected": stats["detected"],
        "validated": stats["validated"],
        "queued": stats["queued"],
        "transferring": stats["transferring"],
        "transferred": stats["transferred"],
        "assigned": stats["assigned"],
        "inProgress": stats["in_progress"],
        "delivered": stats["delivered"],
        "archived": stats["archived"],
        "rejected": stats["rejected"]
    }

@app.get("/api/files")
async def get_files(_user: dict = Depends(get_current_user)):
    files = await storage.get_files()
    return [snake_to_camel(f) for f in files]

@app.get("/api/files/{file_id}")
async def get_file(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return snake_to_camel(file)

@app.post("/api/files")
async def create_file(file_data: FileCreate, _auth: dict = Depends(get_daemon_or_user_auth)):
    file = await storage.create_file({
        "filename": file_data.filename,
        "source_site": file_data.source_site,
        "source_path": file_data.source_path,
        "file_size": file_data.file_size,
        "sha256_hash": file_data.sha256_hash
    })
    await storage.create_audit_log({
        "file_id": file["id"],
        "action": "File registered",
        "previous_state": None,
        "new_state": "detected"
    })
    return snake_to_camel(file)

ALLOWED_SITES = {"tustin", "nashville", "dallas"}

@app.post("/api/files/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    source_site: str = Form(...),
    source_path: str = Form(...)
):
    """Upload a file from a site daemon"""
    await get_daemon_or_user_auth(request)
    if source_site not in ALLOWED_SITES:
        raise HTTPException(status_code=400, detail=f"Invalid site: {source_site}")
    
    safe_filename = os.path.basename(file.filename or "unnamed")
    if not safe_filename or ".." in safe_filename or "/" in safe_filename or "\\" in safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    site_dir = os.path.join(STORAGE_PATH, source_site)
    os.makedirs(site_dir, exist_ok=True)
    
    dest_path = os.path.join(site_dir, safe_filename)
    
    sha256 = hashlib.sha256()
    file_size = 0
    
    async with aiofiles.open(dest_path, 'wb') as out_file:
        while chunk := await file.read(1024 * 1024):
            await out_file.write(chunk)
            sha256.update(chunk)
            file_size += len(chunk)
    
    sha256_hash = sha256.hexdigest()
    
    db_file = await storage.create_file({
        "filename": safe_filename,
        "source_site": source_site,
        "source_path": source_path,
        "file_size": file_size,
        "sha256_hash": sha256_hash
    })
    
    await storage.create_audit_log({
        "file_id": db_file["id"],
        "action": f"File uploaded from {source_site}",
        "previous_state": None,
        "new_state": "detected"
    })
    
    return snake_to_camel({
        **db_file,
        "storage_path": dest_path
    })

@app.get("/api/settings")
async def get_settings(_user: dict = Depends(get_current_user)):
    """Get current storage settings"""
    return {
        "storagePath": STORAGE_PATH,
        "sites": ["tustin", "nashville", "dallas"]
    }

@app.post("/api/files/{file_id}/validate")
async def validate_file(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "detected":
        raise HTTPException(status_code=400, detail="File cannot be validated in current state")
    
    updated = await storage.update_file(file_id, {"state": "validated", "validated_at": datetime.now()})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "File validated",
        "previous_state": "detected",
        "new_state": "validated"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/queue")
async def queue_file(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "validated":
        raise HTTPException(status_code=400, detail="File cannot be queued in current state")
    
    updated = await storage.update_file(file_id, {"state": "queued"})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "File queued for transfer",
        "previous_state": "validated",
        "new_state": "queued"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/start-transfer")
async def start_transfer(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "queued":
        raise HTTPException(status_code=400, detail="File cannot start transfer in current state")
    
    updated = await storage.update_file(file_id, {"state": "transferring", "transfer_started_at": datetime.now()})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "Transfer started",
        "previous_state": "queued",
        "new_state": "transferring"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/complete-transfer")
async def complete_transfer(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "transferring":
        raise HTTPException(status_code=400, detail="File cannot complete transfer in current state")
    
    updated = await storage.update_file(file_id, {
        "state": "transferred",
        "transfer_completed_at": datetime.now(),
        "transfer_progress": 100
    })
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "Transfer completed",
        "previous_state": "transferring",
        "new_state": "transferred"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/assign")
async def assign_file(file_id: str, request: Optional[AssignRequest] = None, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "transferred":
        raise HTTPException(status_code=400, detail="File cannot be assigned in current state")
    
    user_id = request.user_id if request else None
    if not user_id:
        users = await storage.get_users()
        colorist = next((u for u in users if u["role"] == "colorist"), None)
        if colorist:
            user_id = colorist["id"]
    
    if not user_id:
        raise HTTPException(status_code=400, detail="No colorist available for assignment")
    
    updated = await storage.update_file(file_id, {
        "state": "colorist_assigned",
        "assigned_to": user_id,
        "assigned_at": datetime.now()
    })
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "Assigned to colorist",
        "previous_state": "transferred",
        "new_state": "colorist_assigned",
        "performed_by": user_id
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/start")
async def start_work(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "colorist_assigned":
        raise HTTPException(status_code=400, detail="File work cannot be started in current state")
    
    updated = await storage.update_file(file_id, {"state": "in_progress"})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "Color work started",
        "previous_state": "colorist_assigned",
        "new_state": "in_progress"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/deliver")
async def deliver_file(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "in_progress":
        raise HTTPException(status_code=400, detail="File cannot be delivered in current state")
    
    updated = await storage.update_file(file_id, {"state": "delivered_to_mam", "delivered_at": datetime.now()})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "Delivered to MAM",
        "previous_state": "in_progress",
        "new_state": "delivered_to_mam"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/archive")
async def archive_file(file_id: str, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file["state"] != "delivered_to_mam":
        raise HTTPException(status_code=400, detail="File cannot be archived in current state")
    
    updated = await storage.update_file(file_id, {"state": "archived", "archived_at": datetime.now()})
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "File archived",
        "previous_state": "delivered_to_mam",
        "new_state": "archived"
    })
    return snake_to_camel(updated)

@app.post("/api/files/{file_id}/reject")
async def reject_file(file_id: str, request: Optional[RejectRequest] = None, _user: dict = Depends(get_current_user)):
    file = await storage.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    reason = request.reason if request else None
    updated = await storage.update_file(file_id, {
        "state": "rejected",
        "error_message": reason
    })
    await storage.create_audit_log({
        "file_id": file_id,
        "action": "File rejected",
        "previous_state": file["state"],
        "new_state": "rejected",
        "details": reason
    })
    return snake_to_camel(updated)

@app.get("/api/files/{file_id}/audit")
async def get_file_audit(file_id: str, _user: dict = Depends(get_current_user)):
    logs = await storage.get_file_audit_logs(file_id)
    return [snake_to_camel(log) for log in logs]

@app.get("/api/users")
async def get_users(_user: dict = Depends(get_current_user)):
    users = await storage.get_users()
    return [snake_to_camel(u) for u in users]

@app.post("/api/users")
async def create_user(user_data: UserCreate, _user: dict = Depends(get_current_user)):
    user = await storage.create_user({
        "username": user_data.username,
        "display_name": user_data.displayName,
        "password": user_data.password,
        "email": user_data.email,
        "role": user_data.role
    })
    return snake_to_camel(user)

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, _user: dict = Depends(get_current_user)):
    data = {}
    if user_data.username is not None:
        data["username"] = user_data.username
    if user_data.displayName is not None:
        data["display_name"] = user_data.displayName
    if user_data.email is not None:
        data["email"] = user_data.email
    if user_data.role is not None:
        data["role"] = user_data.role
    if user_data.password is not None:
        data["password"] = user_data.password
    
    user = await storage.update_user(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return snake_to_camel(user)

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, _user: dict = Depends(get_current_user)):
    success = await storage.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

@app.get("/api/sites")
async def get_sites(_auth: dict = Depends(get_daemon_or_user_auth)):
    sites = await storage.get_sites()
    return [snake_to_camel(s) for s in sites]

@app.post("/api/sites/{site_id}/heartbeat")
async def site_heartbeat(site_id: str, _auth: dict = Depends(get_daemon_or_user_auth)):
    site = await storage.update_site_heartbeat(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return snake_to_camel(site)

@app.get("/api/audit")
async def get_audit_logs(_user: dict = Depends(get_current_user)):
    logs = await storage.get_audit_logs()
    return [snake_to_camel(log) for log in logs]

@app.get("/api/transfers")
async def get_transfers(_user: dict = Depends(get_current_user)):
    transfers = await storage.get_transfer_jobs()
    return [snake_to_camel(t) for t in transfers]

@app.post("/api/seed")
async def seed_data():
    result = await storage.seed_data()
    return result

@app.get("/api/settings/storage")
async def get_storage_settings(_user: dict = Depends(get_current_user)):
    """Get storage configuration and disk usage"""
    import shutil
    
    total_size = 0
    file_count = 0
    site_stats = {}
    
    for site in ALLOWED_SITES:
        site_path = os.path.join(STORAGE_PATH, site)
        site_size = 0
        site_files = 0
        
        if os.path.exists(site_path):
            for f in os.listdir(site_path):
                file_path = os.path.join(site_path, f)
                if os.path.isfile(file_path):
                    size = os.path.getsize(file_path)
                    site_size += size
                    site_files += 1
        
        site_stats[site] = {
            "fileCount": site_files,
            "totalSize": site_size
        }
        total_size += site_size
        file_count += site_files
    
    disk_usage = None
    try:
        usage = shutil.disk_usage(STORAGE_PATH)
        disk_usage = {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "percentUsed": round((usage.used / usage.total) * 100, 1)
        }
    except:
        pass
    
    return {
        "storagePath": STORAGE_PATH,
        "allowedSites": list(ALLOWED_SITES),
        "totalFiles": file_count,
        "totalSize": total_size,
        "siteStats": site_stats,
        "diskUsage": disk_usage
    }

dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist", "public")
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        return FileResponse(os.path.join(dist_path, "index.html"))

if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_PORT", "5001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
