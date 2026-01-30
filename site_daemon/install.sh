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

read -p "Enter site name (e.g., tustin, nashville, studio-a): " SITE_NAME < /dev/tty
read -p "Enter watch directory path: " WATCH_PATH < /dev/tty
read -p "Enter orchestrator URL (e.g., http://192.168.1.100): " ORCHESTRATOR_URL < /dev/tty
read -p "Enter daemon API key (from orchestrator install): " DAEMON_API_KEY < /dev/tty

if [ -z "$SITE_NAME" ]; then
  echo "Error: Site name is required"
  exit 1
fi

if [ -z "$DAEMON_API_KEY" ]; then
  echo "Error: Daemon API key is required"
  exit 1
fi

echo ""
echo "Configuration:"
echo "  Site: ${SITE_NAME}"
echo "  Watch Path: ${WATCH_PATH}"
echo "  Orchestrator: ${ORCHESTRATOR_URL}"
echo "  API Key: ****"
echo ""

echo "Creating watch directory if needed..."
mkdir -p "$WATCH_PATH"

echo ""
echo "Installing dependencies..."
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv git

echo ""
echo "Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard origin/main
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "Setting up Python virtual environment..."
rm -rf ${INSTALL_DIR}/venv
python3 -m venv ${INSTALL_DIR}/venv
${INSTALL_DIR}/venv/bin/pip install --upgrade pip
${INSTALL_DIR}/venv/bin/pip install watchdog aiohttp

echo ""
echo "Creating environment file..."
cat > ${INSTALL_DIR}/.env << EOF
SITE_NAME=${SITE_NAME}
WATCH_PATH=${WATCH_PATH}
ORCHESTRATOR_URL=${ORCHESTRATOR_URL}
DAEMON_API_KEY=${DAEMON_API_KEY}
EOF

echo ""
echo "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Color Routing System Site Daemon (${SITE_NAME})
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment="DAEMON_API_KEY=${DAEMON_API_KEY}"
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/site_daemon/daemon.py --site ${SITE_NAME} --watch ${WATCH_PATH} --orchestrator ${ORCHESTRATOR_URL}
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
echo "Waiting for service to start..."
sleep 3

if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "Service is running!"
else
  echo "Warning: Service may not be running. Check with: journalctl -u ${SERVICE_NAME} -f"
fi

echo ""
echo "=============================================="
echo "  Installation Complete!"
echo "=============================================="
echo ""
echo "Site: ${SITE_NAME}"
echo "Watch Path: ${WATCH_PATH}"
echo "Orchestrator: ${ORCHESTRATOR_URL}"
echo ""
echo "The daemon will:"
echo "  - Watch ${WATCH_PATH} for new video files"
echo "  - Report detected files to the orchestrator"
echo "  - Send heartbeats every 30 seconds"
echo ""
echo "Supported file types: .mxf, .mov, .mp4, .ari, .r3d, .braw, .dpx, .exr"
echo ""
echo "Service commands:"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
