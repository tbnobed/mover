#!/usr/bin/env python3
"""
Site Daemon for Color Routing System
Runs at each site (Tustin, Nashville, Dallas) to:
- Watch directories for new files
- Check with orchestrator API before uploading (prevents duplicates)
- Upload files via streaming to central orchestrator
- Validate files (size, hash)
- Send periodic heartbeats
"""

import os
import sys
import time
import json
import hashlib
import asyncio
import argparse
import aiohttp
from pathlib import Path
from datetime import datetime
from typing import Optional, Set
from watchdog.observers.polling import PollingObserver
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:5000")
DAEMON_API_KEY = os.getenv("DAEMON_API_KEY", "")
HEARTBEAT_INTERVAL = 30
SUPPORTED_EXTENSIONS = {".mxf", ".mov", ".mp4", ".mkv", ".avi", ".ari", ".r3d", ".braw", ".dpx", ".exr", ".dng", ".prores"}
# File stability: wait until file hasn't changed for this long (size AND mtime)
# Default: 60 seconds of no changes. Override with FILE_STABILITY_SECONDS env var
FILE_STABILITY_SECONDS = int(os.getenv("FILE_STABILITY_SECONDS", "60"))
FILE_CHECK_INTERVAL = 5  # Check every 5 seconds


def get_auth_headers() -> dict:
    """Get authentication headers for API requests"""
    headers = {}
    if DAEMON_API_KEY:
        headers["X-API-Key"] = DAEMON_API_KEY
    return headers


class FileDetector(FileSystemEventHandler):
    def __init__(self, site_id: str, watch_path: str, orchestrator_url: str, pending_queue: asyncio.Queue):
        self.site_id = site_id
        self.watch_path = watch_path
        self.orchestrator_url = orchestrator_url
        self.detected_files = set()
        self.pending_queue = pending_queue
        self.seen_files: Set[str] = set()  # Files seen this session (to avoid duplicates in queue)
        
    def on_created(self, event):
        if isinstance(event, FileCreatedEvent):
            file_path = Path(event.src_path)
            if file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                abs_path = str(file_path.absolute())
                # Skip if already in queue this session
                if abs_path in self.seen_files:
                    return
                self.seen_files.add(abs_path)
                self.detected_files.add(event.src_path)
                print(f"[{datetime.now().isoformat()}] Detected: {file_path.name}")
                try:
                    self.pending_queue.put_nowait(abs_path)
                except:
                    pass
    
    async def check_file_exists_on_server(self, sha256_hash: str, filename: str) -> bool:
        """Check with orchestrator API if file already exists (by hash or name+site)"""
        try:
            params = {
                'hash': sha256_hash,
                'filename': filename,
                'site': self.site_id
            }
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.orchestrator_url}/api/files/check",
                    params=params,
                    headers=get_auth_headers()
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get('exists', False)
                    else:
                        # If check fails, proceed with upload (server will reject duplicates)
                        return False
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Error checking file existence: {e}")
            return False
    
    async def wait_for_file_stability(self, file_path: str) -> bool:
        """
        Wait until file hasn't changed for FILE_STABILITY_SECONDS.
        Checks both file size AND modification time to detect active writes.
        For recordings that take hours, this waits until writing stops.
        """
        path = Path(file_path)
        last_size = -1
        last_mtime = -1
        stable_since = None
        
        print(f"[{datetime.now().isoformat()}] Waiting for file to be complete: {path.name} (stability: {FILE_STABILITY_SECONDS}s)")
        
        while True:
            try:
                if not path.exists():
                    print(f"[{datetime.now().isoformat()}] File disappeared: {path.name}")
                    return False
                
                stat = path.stat()
                current_size = stat.st_size
                current_mtime = stat.st_mtime
                
                # Check if file has changed (size or mtime)
                if current_size != last_size or current_mtime != last_mtime:
                    # File changed, reset stability timer
                    stable_since = datetime.now()
                    if last_size > 0 and current_size != last_size:
                        print(f"[{datetime.now().isoformat()}] File still writing: {path.name} ({current_size:,} bytes)")
                    last_size = current_size
                    last_mtime = current_mtime
                else:
                    # File unchanged, check if stable long enough
                    if stable_since and current_size > 0:
                        elapsed = (datetime.now() - stable_since).total_seconds()
                        if elapsed >= FILE_STABILITY_SECONDS:
                            print(f"[{datetime.now().isoformat()}] File complete: {path.name} ({current_size:,} bytes) - stable for {elapsed:.0f}s")
                            return True
                
                await asyncio.sleep(FILE_CHECK_INTERVAL)
                
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Stability check error: {e}")
                return False
    
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
        
        # Calculate hash FIRST for duplicate check
        print(f"[{datetime.now().isoformat()}] Calculating hash: {path.name} ({file_size:,} bytes)")
        sha256_hash = await self.calculate_hash(file_path)
        
        # CHECK WITH ORCHESTRATOR API BEFORE UPLOADING
        print(f"[{datetime.now().isoformat()}] Checking with server if file exists: {path.name}")
        if await self.check_file_exists_on_server(sha256_hash, path.name):
            print(f"[{datetime.now().isoformat()}] SKIPPED (already on server): {path.name}")
            return
        
        print(f"[{datetime.now().isoformat()}] Uploading: {path.name} ({file_size:,} bytes / {file_size / (1024**3):.2f} GB)")
        
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
                elif resp.status == 409:
                    print(f"[{datetime.now().isoformat()}] Already on server: {path.name}")
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
        self.file_detector = FileDetector(site_id, watch_path, orchestrator_url, self.pending_queue)
        # Track files being written (waiting for stability)
        self.writing_files: dict = {}  # path -> {last_size, last_mtime, stable_since}
        self.uploading_file: Optional[str] = None  # Currently uploading file (only one at a time)
        self.stable_queue: asyncio.Queue = asyncio.Queue()  # Files ready for upload
        
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
        """Scan existing files and queue them for processing (will check with orchestrator before upload)"""
        watch_dir = Path(self.watch_path)
        if not watch_dir.exists():
            print(f"[{datetime.now().isoformat()}] Watch directory does not exist, creating: {self.watch_path}")
            watch_dir.mkdir(parents=True, exist_ok=True)
            return
        
        file_count = 0
        
        for file_path in watch_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                abs_path = str(file_path.absolute())
                file_count += 1
                self.file_detector.seen_files.add(abs_path)
                # Always queue existing files - orchestrator API will determine if upload needed
                print(f"[{datetime.now().isoformat()}] Queueing existing: {file_path.name}")
                self.pending_queue.put_nowait(abs_path)
        
        print(f"[{datetime.now().isoformat()}] Found {file_count} video files - all queued for orchestrator check")
    
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
        event_handler = FileDetector(self.site_id, self.watch_path, self.orchestrator_url, self.pending_queue)
        self.file_detector = event_handler
        self.observer = PollingObserver(timeout=5)  # Poll every 5 seconds for network mount compatibility
        self.observer.schedule(event_handler, self.watch_path, recursive=False)
        self.observer.start()
        print(f"[{datetime.now().isoformat()}] File watcher started for {self.watch_path}")
        print(f"[{datetime.now().isoformat()}] Duplicate check: Files will be verified with orchestrator API before upload")
    
    def check_file_stability_instant(self, file_path: str) -> tuple[bool, bool]:
        """
        Check file stability without blocking.
        Returns: (is_stable, should_track)
        - is_stable: True if file has been unchanged for FILE_STABILITY_SECONDS
        - should_track: True if file exists and should continue tracking
        """
        path = Path(file_path)
        try:
            if not path.exists():
                return False, False
            
            stat = path.stat()
            current_size = stat.st_size
            current_mtime = stat.st_mtime
            now = datetime.now()
            
            if file_path not in self.writing_files:
                # First time seeing this file
                self.writing_files[file_path] = {
                    'last_size': current_size,
                    'last_mtime': current_mtime,
                    'stable_since': now,
                    'name': path.name
                }
                print(f"[{now.isoformat()}] Tracking file stability: {path.name} ({current_size:,} bytes)")
                return False, True
            
            info = self.writing_files[file_path]
            
            # Check if file changed
            if current_size != info['last_size'] or current_mtime != info['last_mtime']:
                info['last_size'] = current_size
                info['last_mtime'] = current_mtime
                info['stable_since'] = now
                return False, True
            
            # File unchanged - check how long
            elapsed = (now - info['stable_since']).total_seconds()
            if elapsed >= FILE_STABILITY_SECONDS:
                print(f"[{now.isoformat()}] File complete: {path.name} ({current_size:,} bytes) - stable for {elapsed:.0f}s")
                del self.writing_files[file_path]
                return True, False
            
            return False, True
            
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Stability check error for {path.name}: {e}")
            return False, False
    
    async def check_writing_files(self):
        """Periodically check files being written and queue stable ones for upload"""
        while self.running:
            try:
                stable_files = []
                still_writing = []
                
                for file_path in list(self.writing_files.keys()):
                    is_stable, should_track = self.check_file_stability_instant(file_path)
                    if is_stable:
                        stable_files.append(file_path)
                    elif should_track:
                        still_writing.append(file_path)
                
                # Queue stable files for upload
                for file_path in stable_files:
                    await self.stable_queue.put(file_path)
                
                # Log files still writing (every 30 seconds)
                if still_writing and int(time.time()) % 30 == 0:
                    for fp in still_writing:
                        info = self.writing_files.get(fp, {})
                        size = info.get('last_size', 0)
                        name = info.get('name', Path(fp).name)
                        print(f"[{datetime.now().isoformat()}] Still writing: {name} ({size:,} bytes)")
                
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Error checking writing files: {e}")
            
            await asyncio.sleep(FILE_CHECK_INTERVAL)
    
    async def process_pending_files(self):
        """Process incoming files - check stability and route accordingly"""
        while self.running:
            try:
                file_path = await asyncio.wait_for(self.pending_queue.get(), timeout=1.0)
                
                # Quick stability check
                is_stable, should_track = self.check_file_stability_instant(file_path)
                
                if is_stable:
                    # File is stable, queue for upload
                    await self.stable_queue.put(file_path)
                elif not should_track:
                    # File disappeared or error
                    print(f"[{datetime.now().isoformat()}] Skipping file (not found): {Path(file_path).name}")
                # else: file is being tracked in writing_files
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Error processing file: {e}")
    
    async def upload_stable_files(self):
        """Upload files that have been verified as stable"""
        while self.running:
            try:
                file_path = await asyncio.wait_for(self.stable_queue.get(), timeout=1.0)
                
                # Only upload one file at a time
                self.uploading_file = file_path
                try:
                    await self.file_detector.upload_file(file_path)
                finally:
                    self.uploading_file = None
                    
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"[{datetime.now().isoformat()}] Error uploading file: {e}")
                self.uploading_file = None
    
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
                self.process_pending_files(),
                self.check_writing_files(),
                self.upload_stable_files()
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
