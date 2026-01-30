import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from database import get_pool

async def get_files() -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM files ORDER BY detected_at DESC")
        return [dict(row) for row in rows]

async def get_file(file_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
        return dict(row) if row else None

async def create_file(data: Dict[str, Any]) -> Dict[str, Any]:
    pool = await get_pool()
    file_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO files (id, filename, source_site, source_path, file_size, sha256_hash, state, detected_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'detected', NOW())
        """, file_id, data["filename"], data["source_site"], data["source_path"], data["file_size"], data["sha256_hash"])
        row = await conn.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
        return dict(row)

async def update_file(file_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        set_clauses = []
        values = []
        for i, (key, value) in enumerate(updates.items(), start=1):
            set_clauses.append(f"{key} = ${i}")
            values.append(value)
        values.append(file_id)
        query = f"UPDATE files SET {', '.join(set_clauses)} WHERE id = ${len(values)}"
        await conn.execute(query, *values)
        row = await conn.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
        return dict(row) if row else None

async def get_users() -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM users ORDER BY created_at DESC")
        return [dict(row) for row in rows]

async def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        return dict(row) if row else None

async def create_user(data: Dict[str, Any]) -> Dict[str, Any]:
    pool = await get_pool()
    user_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (id, username, email, role, is_active, created_at)
            VALUES ($1, $2, $3, $4, true, NOW())
        """, user_id, data["username"], data["email"], data["role"])
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        return dict(row)

async def get_sites() -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM sites")
        return [dict(row) for row in rows]

async def update_site_heartbeat(site_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM sites WHERE name = $1", site_id)
        if not row:
            try:
                row = await conn.fetchrow("SELECT * FROM sites WHERE id = $1::uuid", site_id)
            except:
                return None
        if row:
            await conn.execute("UPDATE sites SET last_heartbeat = NOW() WHERE id = $1", row["id"])
            row = await conn.fetchrow("SELECT * FROM sites WHERE id = $1", row["id"])
            return dict(row) if row else None
        return None

async def get_audit_logs() -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")
        return [dict(row) for row in rows]

async def get_file_audit_logs(file_id: str) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM audit_logs WHERE file_id = $1 ORDER BY created_at DESC", file_id)
        return [dict(row) for row in rows]

async def create_audit_log(data: Dict[str, Any]) -> Dict[str, Any]:
    pool = await get_pool()
    log_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO audit_logs (id, file_id, action, previous_state, new_state, performed_by, ip_address, details, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        """, log_id, data.get("file_id"), data["action"], data.get("previous_state"), data.get("new_state"),
            data.get("performed_by"), data.get("ip_address"), data.get("details"))
        row = await conn.fetchrow("SELECT * FROM audit_logs WHERE id = $1", log_id)
        return dict(row)

async def get_transfer_jobs() -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM transfer_jobs ORDER BY started_at DESC")
        return [dict(row) for row in rows]

async def get_stats() -> Dict[str, int]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT state, COUNT(*) as count FROM files GROUP BY state")
        stats = {
            "total_files": 0,
            "detected": 0,
            "validated": 0,
            "queued": 0,
            "transferring": 0,
            "transferred": 0,
            "assigned": 0,
            "in_progress": 0,
            "delivered": 0,
            "archived": 0,
            "rejected": 0
        }
        for row in rows:
            state = row["state"]
            count = row["count"]
            stats["total_files"] += count
            if state == "detected":
                stats["detected"] = count
            elif state == "validated":
                stats["validated"] = count
            elif state == "queued":
                stats["queued"] = count
            elif state == "transferring":
                stats["transferring"] = count
            elif state == "transferred":
                stats["transferred"] = count
            elif state == "colorist_assigned":
                stats["assigned"] = count
            elif state == "in_progress":
                stats["in_progress"] = count
            elif state == "delivered_to_mam":
                stats["delivered"] = count
            elif state == "archived":
                stats["archived"] = count
            elif state == "rejected":
                stats["rejected"] = count
        return stats

async def seed_data():
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing_sites = await conn.fetch("SELECT * FROM sites LIMIT 1")
        if existing_sites:
            return {"message": "Data already seeded"}
        
        site1_id = str(uuid.uuid4())
        site2_id = str(uuid.uuid4())
        site3_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO sites (id, name, export_path, is_active, last_heartbeat) VALUES
            ($1, 'tustin', '/mnt/tustin_exports/color_ready/', 'true', NOW()),
            ($2, 'nashville', '/mnt/nsh_exports/color_ready/', 'true', NOW() - INTERVAL '2 minutes'),
            ($3, 'dallas', '/mnt/dal_exports/color_ready/', 'true', NOW() - INTERVAL '10 minutes')
        """, site1_id, site2_id, site3_id)
        
        user1_id = str(uuid.uuid4())
        user2_id = str(uuid.uuid4())
        user3_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO users (id, username, email, role, is_active, created_at) VALUES
            ($1, 'jsmith', 'jsmith@studio.com', 'colorist', true, NOW()),
            ($2, 'mwilson', 'mwilson@studio.com', 'colorist', true, NOW()),
            ($3, 'admin', 'admin@studio.com', 'admin', true, NOW())
        """, user1_id, user2_id, user3_id)
        
        file1_id = str(uuid.uuid4())
        file2_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO files (id, filename, source_site, source_path, file_size, sha256_hash, state, detected_at) VALUES
            ($1, 'Episode_01_Final_v3.mov', 'tustin', '/mnt/tustin_exports/color_ready/Episode_01_Final_v3.mov', 
             15728640000, 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', 'transferred', NOW()),
            ($2, 'Commercial_Spring_2024.mxf', 'nashville', '/mnt/nsh_exports/color_ready/Commercial_Spring_2024.mxf',
             8589934592, 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a', 'transferring', NOW())
        """, file1_id, file2_id)
        
        await conn.execute("UPDATE files SET transfer_progress = 45 WHERE id = $1", file2_id)
        
        await conn.execute("""
            INSERT INTO audit_logs (id, file_id, action, previous_state, new_state, created_at) VALUES
            ($1, $2, 'File registered', NULL, 'detected', NOW()),
            ($3, $2, 'File validated', 'detected', 'validated', NOW()),
            ($4, $2, 'Transfer completed', 'transferring', 'transferred', NOW()),
            ($5, $6, 'Transfer started', 'queued', 'transferring', NOW())
        """, str(uuid.uuid4()), file1_id, str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()), file2_id)
        
        return {"message": "Demo data seeded successfully"}
