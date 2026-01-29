import os
import asyncpg
from typing import Optional

DATABASE_URL = os.environ.get("DATABASE_URL")

pool: Optional[asyncpg.Pool] = None

async def get_pool():
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(DATABASE_URL)
    return pool

async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
