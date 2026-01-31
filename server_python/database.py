import os
import asyncpg
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL")

pool: Optional[asyncpg.Pool] = None

SCHEMA_SQL = """
-- Create enums if they don't exist
DO $$ BEGIN
    CREATE TYPE file_state AS ENUM (
        'detected', 'validated', 'queued', 'transferring', 'transferred',
        'colorist_assigned', 'in_progress', 'delivered_to_mam', 'archived', 'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'colorist', 'engineer', 'readonly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'colorist',
    email TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL UNIQUE,
    export_path TEXT NOT NULL,
    is_active TEXT NOT NULL DEFAULT 'true',
    last_heartbeat TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    filename TEXT NOT NULL,
    source_site TEXT NOT NULL,
    source_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    sha256_hash TEXT NOT NULL,
    state file_state NOT NULL DEFAULT 'detected',
    assigned_to VARCHAR REFERENCES users(id),
    raysync_job_id TEXT,
    transfer_progress INTEGER DEFAULT 0,
    error_message TEXT,
    detected_at TIMESTAMP DEFAULT NOW() NOT NULL,
    validated_at TIMESTAMP,
    transfer_started_at TIMESTAMP,
    transfer_completed_at TIMESTAMP,
    assigned_at TIMESTAMP,
    delivered_at TIMESTAMP,
    archived_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    file_id VARCHAR REFERENCES files(id),
    action TEXT NOT NULL,
    previous_state file_state,
    new_state file_state,
    performed_by VARCHAR REFERENCES users(id),
    ip_address TEXT,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer_jobs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    file_id VARCHAR REFERENCES files(id) NOT NULL,
    raysync_job_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    bytes_transferred BIGINT DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR REFERENCES users(id) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
"""

async def init_schema(conn):
    """Initialize database schema if tables don't exist"""
    await conn.execute(SCHEMA_SQL)

async def get_pool():
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(DATABASE_URL)
        # Initialize schema on first connection
        async with pool.acquire() as conn:
            await init_schema(conn)
    return pool

async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
