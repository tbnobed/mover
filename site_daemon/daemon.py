#!/usr/bin/env python3
"""
Site Daemon for Color Routing System
Runs at each site (Tustin, Nashville, Dallas) to:
- Watch directories for new files
- Report detected files to central orchestrator
- Validate files (size, hash)
- Handle RaySync transfer commands
- Send periodic heartbeats
- Track uploaded files in local SQLite database to prevent re-uploads
"""

import os
import sys
import time
import json
import hashlib
import asyncio
import argparse
import aiohttp
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional, Set
from watchdog.observers.polling import PollingObserver
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:5000")
DAEMON_API_KEY = os.getenv("DAEMON_API_KEY", "")
HEARTBEAT_INTERVAL = 30
SUPPORTED_EXTENSIONS = {".mxf", ".mov", ".mp4", ".ari", ".r3d", ".braw", ".dpx", ".exr"}
FILE_STABILITY_CHECKS = 3  # Number of checks where file size must be stable
FILE_STABILITY_INTERVAL = 2  # Seconds between stability checks


class UploadTracker:
    """SQLite-based tracker to remember which files have been uploaded"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                sha256_hash TEXT,
                uploaded_at TEXT NOT NULL,
                orchestrator_id TEXT
            )
        ''')
        conn.commit()
        conn.close()
    
    def is_uploaded(self, file_path: str) -> bool:
        """Check if a file has already been uploaded"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT 1 FROM uploaded_files WHERE file_path = ?', (file_path,))
        result = cursor.fetchone() is not None
        conn.close()
        return result
    
    def mark_uploaded(self, file_path: str, filename: str, file_size: int, sha256_hash: str = None, orchestrator_id: str = None):
        """Mark a file as successfully uploaded"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO uploaded_files (file_path, filename, file_size, sha256_hash, uploaded_at, orchestrator_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (file_path, filename, file_size, sha256_hash, datetime.now().isoformat(), orchestrator_id))
        conn.commit()
        conn.close()
    
    def get_upload_count(self) -> int:
        """Get total number of uploaded files"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM uploaded_files')
        count = cursor.fetchone()[0]
        conn.close()
        return count


def get_auth_headers() -> dict:
    """Get authentication headers for API requests"""
    headers = {}
    if DAEMON_API_KEY:
        headers["X-API-Key"] = DAEMON_API_KEY
    return headers


class FileDetector(FileSystemEventHandler):
    def __init__(self, site_id: str, watch_path: str, orchestrator_url: str, pending_queue: asyncio.Queue, upload_tracker: UploadTracker = None):
        self.site_id = site_id
        self.watch_path = watch_path
        self.orchestrator_url = orchestrator_url
        self.detected_files = set()
        self.pending_queue = pending_queue
        self.upload_tracker = upload_tracker
        self.seen_files: Set[str] = set()  # Files seen this session (to avoid duplicates in queue)
        
    def on_created(self, event):
        if isinstance(event, FileCreatedEvent):
            file_path = Path(event.src_path)
            if file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                abs_path = str(file_path.absolute())
                # Skip if already in queue this session
                if abs_path in self.seen_files:
                    return
                # Skip if already uploaded (check database)
                if self.upload_tracker and self.upload_tracker.is_uploaded(abs_path):
                    print(f"[{datetime.now().isoformat()}] Skipping (already uploaded): {file_path.name}")
                    return
                self.seen_files.add(abs_path)
                self.detected_files.add(event.src_path)
                print(f"[{datetime.now().isoformat()}] Detected: {file_path.name}")
                try:
                    self.pending_queue.put_nowait(abs_path)
                except:
                    pass
    
    async def wait_for_file_stability(self, file_path: str) -> bool:
        """Wait until file size stops changing (file is completely written)"""
        path = Path(file_path)
        stable_count = 0
        last_size = -1
        
        print(f"[{datetime.now().isoformat()}] Waiting for file to be complete: {path.name}")
        
        while stable_count < FILE_STABILITY_CHECKS:
            try:
                if not path.exists():
                    print(f"[{datetime.now().isoformat()}] File disappeared: {path.name}")
                    return False
                    
                current_size = path.stat().st_size
                
                if current_size == last_size and current_size > 0:
                    stable_count += 1
                else:
                    stable_count = 0
                    
                last_size = current_size
                await asyncio.sleep(FILE_STABILITY_INTERVAL)
                
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Stability check error: {e}")
                return False
        
        print(f"[{datetime.now().isoformat()}] File complete: {path.name} ({last_size:,} bytes)")
        return True
    
    async def report_file(self, file_path: str, upload_file: bool = True):
        path = Path(file_path)
        try:
            # Wait for file to be completely written
            if not await self.wait_for_file_stability(file_path):
                print(f"[{datetime.now().isoformat()}] Skipping unstable file: {path.name}")
                return
                
            if upload_file:
                await self.upload_file(file_path)
            else:
                await self.report_metadata(file_path)
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Error reporting file: {e}")
    
    async def upload_file(self, file_path: str):
        """Upload the actual file to the orchestrator using streaming"""
        path = Path(file_path)
        file_size = path.stat().st_size
        print(f"[{datetime.now().isoformat()}] Uploading: {path.name} ({file_size:,} bytes / {file_size / (1024**3):.2f} GB)")
        
        # Calculate hash before upload for verification
        sha256_hash = await self.calculate_hash(file_path)
        
        # Streaming file reader generator - handles files of any size
        async def file_sender():
            chunk_size = 64 * 1024 * 1024  # 64MB chunks for large files
            bytes_sent = 0
            last_progress = 0
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    bytes_sent += len(chunk)
                    # Log progress every 10%
                    progress = int((bytes_sent / file_size) * 100) if file_size > 0 else 100
                    if progress >= last_progress + 10:
                        print(f"[{datetime.now().isoformat()}] Upload progress: {path.name} - {progress}% ({bytes_sent:,} / {file_size:,} bytes)")
                        last_progress = progress
                    yield chunk
        
        # Very long timeout for massive files (base 1 hour + 1 hour per TB)
        tb_count = max(1, file_size // (1024**4))
        timeout_seconds = 3600 + (tb_count * 3600)
        timeout = aiohttp.ClientTimeout(total=timeout_seconds, sock_read=3600)
        
        headers = get_auth_headers()
        headers['X-File-Size'] = str(file_size)
        headers['X-File-Hash'] = sha256_hash
        headers['X-Source-Site'] = self.site_id
        headers['X-Source-Path'] = str(path.absolute())
        headers['Content-Type'] = 'application/octet-stream'
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{self.orchestrator_url}/api/files/upload-stream",
                data=file_sender(),
                headers=headers,
                params={'filename': path.name}
            ) as resp:
                if resp.status == 200 or resp.status == 201:
                    result = await resp.json()
                    orchestrator_id = result.get('id', 'unknown')
                    print(f"[{datetime.now().isoformat()}] Uploaded: {path.name} ({file_size:,} bytes) -> {orchestrator_id}")
                    # Mark as uploaded in local database
                    if self.upload_tracker:
                        self.upload_tracker.mark_uploaded(file_path, path.name, file_size, sha256_hash, orchestrator_id)
                elif resp.status == 409:
                    # Already exists on server - mark as uploaded locally too
                    text = await resp.text()
                    print(f"[{datetime.now().isoformat()}] Already tracked on server: {path.name}")
                    if self.upload_tracker:
                        self.upload_tracker.mark_uploaded(file_path, path.name, file_size, sha256_hash, None)
                else:
                    text = await resp.text()
                    print(f"[{datetime.now().isoformat()}] Upload failed: {resp.status} - {text}")
    
    async def report_metadata(self, file_path: str):
        """Report file metadata only (no file transfer)"""
        path = Path(file_path)
        stat = path.stat()
        file_size = stat.st_size
        sha256_hash = await self.calculate_hash(file_path)
        
        payload = {
            "filename": path.name,
            "source_site": self.site_id,
            "source_path": str(path.absolute()),
            "file_size": file_size,
            "sha256_hash": sha256_hash,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.orchestrator_url}/api/files",
                json=payload,
                headers=get_auth_headers()
            ) as resp:
                if resp.status == 200 or resp.status == 201:
                    data = await resp.json()
                    print(f"[{datetime.now().isoformat()}] Reported: {path.name} -> {data.get('id', 'unknown')}")
                else:
                    text = await resp.text()
                    print(f"[{datetime.now().isoformat()}] Failed to report: {resp.status} - {text}")
    
    async def calculate_hash(self, file_path: str) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()


class SiteDaemon:
    def __init__(self, site_id: str, watch_path: str, orchestrator_url: str, upload_files: bool = True, upload_existing: bool = False):
        self.site_id = site_id
        self.watch_path = watch_path
        self.orchestrator_url = orchestrator_url
        self.upload_files = upload_files
        self.upload_existing = upload_existing
        self.running = False
        self.observer: Optional[Observer] = None
        self.pending_queue: asyncio.Queue = asyncio.Queue()
        
        # Create upload tracker database in the watch directory
        db_path = os.path.join(watch_path, f".upload_tracker_{site_id}.db")
        self.upload_tracker = UploadTracker(db_path)
        self.file_detector = FileDetector(site_id, watch_path, orchestrator_url, self.pending_queue, self.upload_tracker)
        
    async def send_heartbeat(self):
        try:
            payload = {
                "diskFreeGb": self.get_disk_free_gb(),
                "activeTransfers": 0,
                "version": "1.0.0"
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.orchestrator_url}/api/sites/{self.site_id}/heartbeat",
                    json=payload,
                    headers=get_auth_headers()
                ) as resp:
                    if resp.status == 200:
                        print(f"[{datetime.now().isoformat()}] Heartbeat sent for {self.site_id}")
                    else:
                        text = await resp.text()
                        print(f"[{datetime.now().isoformat()}] Heartbeat failed: {resp.status} - {text}")
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Heartbeat error: {e}")
    
    def get_disk_free_gb(self) -> float:
        try:
            stat = os.statvfs(self.watch_path)
            free_bytes = stat.f_bavail * stat.f_frsize
            return round(free_bytes / (1024 ** 3), 2)
        except:
            return 0.0
    
    async def heartbeat_loop(self):
        while self.running:
            await self.send_heartbeat()
            await asyncio.sleep(HEARTBEAT_INTERVAL)
    
    async def scan_existing_files(self, upload_existing: bool = False):
        """Scan existing files - checks database to avoid re-uploads"""
        watch_dir = Path(self.watch_path)
        if not watch_dir.exists():
            print(f"[{datetime.now().isoformat()}] Watch directory does not exist, creating: {self.watch_path}")
            watch_dir.mkdir(parents=True, exist_ok=True)
            return
        
        already_uploaded = 0
        new_files = 0
        queued = 0
        
        for file_path in watch_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                abs_path = str(file_path.absolute())
                
                # Check if already uploaded in database
                if self.upload_tracker.is_uploaded(abs_path):
                    already_uploaded += 1
                    self.file_detector.seen_files.add(abs_path)
                else:
                    new_files += 1
                    self.file_detector.seen_files.add(abs_path)
                    if upload_existing:
                        print(f"[{datetime.now().isoformat()}] Queueing: {file_path.name}")
                        self.pending_queue.put_nowait(abs_path)
                        queued += 1
        
        print(f"[{datetime.now().isoformat()}] Scan complete: {already_uploaded} already uploaded, {new_files} new files found")
        if queued > 0:
            print(f"[{datetime.now().isoformat()}] Queued {queued} files for upload")
        elif new_files > 0:
            print(f"[{datetime.now().isoformat()}] {new_files} new files skipped (use --upload-existing to upload)")
    
    async def simulate_transfer(self, file_id: str, source_path: str, dest_site: str):
        print(f"[{datetime.now().isoformat()}] Simulating RaySync transfer: {source_path} -> {dest_site}")
        await asyncio.sleep(2)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.orchestrator_url}/api/files/{file_id}/complete-transfer",
                    json={"transferredBy": self.site_id},
                    headers=get_auth_headers()
                ) as resp:
                    if resp.status == 200:
                        print(f"[{datetime.now().isoformat()}] Transfer completed: {file_id}")
                    else:
                        text = await resp.text()
                        print(f"[{datetime.now().isoformat()}] Transfer completion failed: {resp.status} - {text}")
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Transfer error: {e}")
    
    def start_watcher(self):
        event_handler = FileDetector(self.site_id, self.watch_path, self.orchestrator_url, self.pending_queue, self.upload_tracker)
        self.file_detector = event_handler
        self.observer = PollingObserver(timeout=5)  # Poll every 5 seconds for network mount compatibility
        self.observer.schedule(event_handler, self.watch_path, recursive=False)
        self.observer.start()
        print(f"[{datetime.now().isoformat()}] File watcher started for {self.watch_path}")
        print(f"[{datetime.now().isoformat()}] Upload tracker: {self.upload_tracker.get_upload_count()} files already uploaded")
    
    async def process_pending_files(self):
        while self.running:
            try:
                file_path = await asyncio.wait_for(self.pending_queue.get(), timeout=1.0)
                await self.file_detector.report_file(file_path, upload_file=self.upload_files)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Error processing file: {e}")
    
    async def run(self):
        self.running = True
        auth_status = "Enabled" if DAEMON_API_KEY else "Disabled (no API key)"
        print(f"")
        print(f"{'='*60}")
        print(f"  Color Routing System - Site Daemon")
        print(f"  Site: {self.site_id}")
        print(f"  Watch Path: {self.watch_path}")
        print(f"  Orchestrator: {self.orchestrator_url}")
        print(f"  Authentication: {auth_status}")
        print(f"{'='*60}")
        print(f"")
        
        self.start_watcher()
        await self.scan_existing_files(upload_existing=self.upload_existing)
        
        try:
            await asyncio.gather(
                self.heartbeat_loop(),
                self.process_pending_files()
            )
        except KeyboardInterrupt:
            print(f"\n[{datetime.now().isoformat()}] Shutting down...")
        finally:
            self.running = False
            if self.observer:
                self.observer.stop()
                self.observer.join()


def main():
    parser = argparse.ArgumentParser(description="Site Daemon for Color Routing System")
    parser.add_argument(
        "--site", "-s",
        required=True,
        help="Site ID (e.g., tustin, nashville, studio-a)"
    )
    parser.add_argument(
        "--watch", "-w",
        default=None,
        help="Directory to watch for new files (default: ./watch_<site>)"
    )
    parser.add_argument(
        "--orchestrator", "-o",
        default=ORCHESTRATOR_URL,
        help=f"Orchestrator URL (default: {ORCHESTRATOR_URL})"
    )
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Only report metadata, don't upload files (default: upload files)"
    )
    parser.add_argument(
        "--api-key", "-k",
        default=None,
        help="API key for authenticating with orchestrator (or set DAEMON_API_KEY env var)"
    )
    
    args = parser.parse_args()
    
    global DAEMON_API_KEY
    if args.api_key:
        DAEMON_API_KEY = args.api_key
    
    watch_path = args.watch or f"./watch_{args.site}"
    Path(watch_path).mkdir(parents=True, exist_ok=True)
    
    upload_files = not args.metadata_only
    
    daemon = SiteDaemon(args.site, watch_path, args.orchestrator, upload_files)
    asyncio.run(daemon.run())


if __name__ == "__main__":
    main()
