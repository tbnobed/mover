#!/usr/bin/env python3
"""
Site Daemon for Color Routing System
Runs at each site (Tustin, Nashville, Dallas) to:
- Watch directories for new files
- Report detected files to central orchestrator
- Validate files (size, hash)
- Handle RaySync transfer commands
- Send periodic heartbeats
"""

import os
import sys
import time
import hashlib
import asyncio
import argparse
import aiohttp
from pathlib import Path
from datetime import datetime
from typing import Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:5000")
HEARTBEAT_INTERVAL = 30
SUPPORTED_EXTENSIONS = {".mxf", ".mov", ".mp4", ".ari", ".r3d", ".braw", ".dpx", ".exr"}


class FileDetector(FileSystemEventHandler):
    def __init__(self, site_id: str, watch_path: str, orchestrator_url: str, pending_queue: asyncio.Queue):
        self.site_id = site_id
        self.watch_path = watch_path
        self.orchestrator_url = orchestrator_url
        self.detected_files = set()
        self.pending_queue = pending_queue
        
    def on_created(self, event):
        if isinstance(event, FileCreatedEvent):
            file_path = Path(event.src_path)
            if file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                if event.src_path not in self.detected_files:
                    self.detected_files.add(event.src_path)
                    print(f"[{datetime.now().isoformat()}] Detected: {file_path.name}")
                    try:
                        self.pending_queue.put_nowait(event.src_path)
                    except:
                        pass
    
    async def report_file(self, file_path: str, upload_file: bool = True):
        path = Path(file_path)
        try:
            if upload_file:
                await self.upload_file(file_path)
            else:
                await self.report_metadata(file_path)
        except Exception as e:
            print(f"[{datetime.now().isoformat()}] Error reporting file: {e}")
    
    async def upload_file(self, file_path: str):
        """Upload the actual file to the orchestrator"""
        path = Path(file_path)
        print(f"[{datetime.now().isoformat()}] Uploading: {path.name}")
        
        async with aiohttp.ClientSession() as session:
            with open(file_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field('file', f, filename=path.name)
                data.add_field('source_site', self.site_id)
                data.add_field('source_path', str(path.absolute()))
                
                async with session.post(
                    f"{self.orchestrator_url}/api/files/upload",
                    data=data
                ) as resp:
                    if resp.status == 200 or resp.status == 201:
                        result = await resp.json()
                        print(f"[{datetime.now().isoformat()}] Uploaded: {path.name} -> {result.get('id', 'unknown')}")
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
                json=payload
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
    def __init__(self, site_id: str, watch_path: str, orchestrator_url: str, upload_files: bool = True):
        self.site_id = site_id
        self.watch_path = watch_path
        self.orchestrator_url = orchestrator_url
        self.upload_files = upload_files
        self.running = False
        self.observer: Optional[Observer] = None
        self.pending_queue: asyncio.Queue = asyncio.Queue()
        self.file_detector = FileDetector(site_id, watch_path, orchestrator_url, self.pending_queue)
        
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
                    json=payload
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
    
    async def scan_existing_files(self):
        print(f"[{datetime.now().isoformat()}] Scanning existing files in {self.watch_path}")
        watch_dir = Path(self.watch_path)
        if not watch_dir.exists():
            print(f"[{datetime.now().isoformat()}] Watch directory does not exist, creating: {self.watch_path}")
            watch_dir.mkdir(parents=True, exist_ok=True)
            return
            
        for file_path in watch_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                print(f"[{datetime.now().isoformat()}] Found existing file: {file_path.name}")
                self.pending_queue.put_nowait(str(file_path.absolute()))
    
    async def simulate_transfer(self, file_id: str, source_path: str, dest_site: str):
        print(f"[{datetime.now().isoformat()}] Simulating RaySync transfer: {source_path} -> {dest_site}")
        await asyncio.sleep(2)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.orchestrator_url}/api/files/{file_id}/complete-transfer",
                    json={"transferredBy": self.site_id}
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
        self.observer = Observer()
        self.observer.schedule(event_handler, self.watch_path, recursive=False)
        self.observer.start()
        print(f"[{datetime.now().isoformat()}] File watcher started for {self.watch_path}")
    
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
        print(f"")
        print(f"{'='*60}")
        print(f"  Color Routing System - Site Daemon")
        print(f"  Site: {self.site_id}")
        print(f"  Watch Path: {self.watch_path}")
        print(f"  Orchestrator: {self.orchestrator_url}")
        print(f"{'='*60}")
        print(f"")
        
        self.start_watcher()
        await self.scan_existing_files()
        
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
        choices=["tustin", "nashville", "dallas"],
        help="Site ID (tustin, nashville, or dallas)"
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
    
    args = parser.parse_args()
    
    watch_path = args.watch or f"./watch_{args.site}"
    Path(watch_path).mkdir(parents=True, exist_ok=True)
    
    upload_files = not args.metadata_only
    
    daemon = SiteDaemon(args.site, watch_path, args.orchestrator, upload_files)
    asyncio.run(daemon.run())


if __name__ == "__main__":
    main()
