#!/bin/bash

set -e

REPO_URL="https://github.com/tbnobed/mover.git"
INSTALL_DIR="/opt/color-routing-daemon"
SERVICE_NAME="color-routing-daemon"

echo "=============================================="
echo "  Color Routing System - Site Daemon Installer"
echo "=============================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

read -p "Enter site name (tustin/nashville/dallas): " SITE_NAME
read -p "Enter watch directory path: " WATCH_PATH
read -p "Enter orchestrator URL (e.g., https://your-app.replit.app): " ORCHESTRATOR_URL

if [[ ! "$SITE_NAME" =~ ^(tustin|nashville|dallas)$ ]]; then
  echo "Error: Site must be tustin, nashville, or dallas"
  exit 1
fi

if [ ! -d "$WATCH_PATH" ]; then
  echo "Error: Watch directory does not exist: $WATCH_PATH"
  exit 1
fi

echo ""
echo "Installing dependencies..."
apt-get update -qq
apt-get install -y python3 python3-pip git

echo ""
echo "Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "Installing Python dependencies..."
pip3 install watchdog aiohttp

echo ""
echo "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Color Routing System Site Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/site_daemon/daemon.py --site ${SITE_NAME} --watch ${WATCH_PATH} --orchestrator ${ORCHESTRATOR_URL}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo ""
echo "=============================================="
echo "  Installation Complete!"
echo "=============================================="
echo ""
echo "Site: ${SITE_NAME}"
echo "Watch Path: ${WATCH_PATH}"
echo "Orchestrator: ${ORCHESTRATOR_URL}"
echo ""
echo "Service commands:"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
