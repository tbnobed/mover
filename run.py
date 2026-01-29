#!/usr/bin/env python3
import subprocess
import os
import sys
import time

os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("Building frontend...")
result = subprocess.run(["npm", "run", "build"], capture_output=False)
if result.returncode != 0:
    print("Frontend build failed, continuing anyway...")

print("Starting FastAPI server...")
os.environ["PYTHONPATH"] = os.path.join(os.getcwd(), "server_python")
subprocess.run([sys.executable, "server_python/main.py"])
