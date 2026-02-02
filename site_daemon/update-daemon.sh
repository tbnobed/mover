#!/bin/bash

set -e

INSTALL_DIR="/opt/color-routing-daemon"
SERVICE_NAME="color-routing-daemon"

echo "=============================================="
echo "  Color Routing System - Site Daemon Update"
echo "=============================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "Error: Installation not found at $INSTALL_DIR"
  echo "Please run install.sh for fresh installation"
  exit 1
fi

echo "This script will update the Site Daemon."
echo "Your configuration will be preserved."
echo ""

read -p "Continue with update? [y/N]: " CONFIRM < /dev/tty
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Update cancelled."
  exit 0
fi

echo ""
echo "Step 1: Stopping service..."
systemctl stop ${SERVICE_NAME} 2>/dev/null || true

echo ""
echo "Step 2: Backing up environment file..."
cp ${INSTALL_DIR}/.env ${INSTALL_DIR}/.env.backup 2>/dev/null || true

echo ""
echo "Step 3: Pulling latest code..."
cd "$INSTALL_DIR"
git fetch origin
git reset --hard origin/main

echo ""
echo "Step 4: Restoring environment file..."
cp ${INSTALL_DIR}/.env.backup ${INSTALL_DIR}/.env 2>/dev/null || true

echo ""
echo "Step 5: Updating Python dependencies..."
${INSTALL_DIR}/venv/bin/pip install --upgrade watchdog aiohttp

echo ""
echo "Step 6: Clearing Python cache..."
find ${INSTALL_DIR} -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

echo ""
echo "Step 7: Starting service..."
systemctl daemon-reload
systemctl start ${SERVICE_NAME}

echo ""
echo "Waiting for service to start..."
sleep 3

echo ""
echo "Step 8: Verifying update..."
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "Service is running!"
else
  echo "Warning: Service may not be running. Check with: journalctl -u ${SERVICE_NAME} -f"
fi

echo ""
echo "=============================================="
echo "  Update Complete!"
echo "=============================================="
echo ""
echo "New features in this update:"
echo "  - Cleanup task processing (deletes local files on orchestrator request)"
echo "  - Retransfer task processing (re-uploads rejected files)"
echo "  - Path normalization for reliable task completion"
echo ""
echo "Service commands:"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
