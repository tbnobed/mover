#!/bin/bash
set -e

echo "Building frontend..."
npm run build 2>/dev/null || npx vite build --outDir dist/public

echo "Starting Python FastAPI server on port 5000..."
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/server_python"
python server_python/main.py
