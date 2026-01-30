#!/bin/bash

set -e

REPO_URL="https://github.com/tbnobed/mover.git"
INSTALL_DIR="/opt/color-routing-orchestrator"
SERVICE_NAME="color-routing-orchestrator"
DB_NAME="color_routing"
DB_USER="color_routing"

echo "=============================================="
echo "  Color Routing System - Orchestrator Installer"
echo "=============================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

read -p "Enter domain or IP for this server (e.g., orchestrator.example.com): " SERVER_HOST
read -sp "Enter a database password: " DB_PASSWORD
echo ""
read -sp "Enter a session secret (random string): " SESSION_SECRET
echo ""
read -p "Enter storage path for incoming files (default: /data/incoming): " STORAGE_PATH_INPUT
STORAGE_PATH=${STORAGE_PATH_INPUT:-/data/incoming}

echo ""
echo "Step 1: Installing system dependencies..."
apt-get update -qq
apt-get install -y curl git postgresql postgresql-contrib python3 python3-pip python3-venv nginx

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo ""
echo "Step 2: Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "User may already exist"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || echo "Database may already exist"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo ""
echo "Step 3: Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "Step 4: Installing Node.js dependencies..."
npm install

echo ""
echo "Step 5: Setting up Python virtual environment..."
python3 -m venv ${INSTALL_DIR}/venv
${INSTALL_DIR}/venv/bin/pip install --upgrade pip
${INSTALL_DIR}/venv/bin/pip install fastapi uvicorn asyncpg pydantic aiofiles python-multipart

echo ""
echo "Step 6: Creating environment file..."
mkdir -p ${STORAGE_PATH}
cat > ${INSTALL_DIR}/.env << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
STORAGE_PATH=${STORAGE_PATH}
PYTHON_BIN=${INSTALL_DIR}/venv/bin/python3
NODE_ENV=production
PORT=5000
EOF

echo ""
echo "Step 7: Building frontend..."
npm run build

echo ""
echo "Step 8: Running database migrations..."
npm run db:push

echo ""
echo "Step 9: Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Color Routing System Orchestrator
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/npx tsx server/production.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "Step 10: Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/${SERVICE_NAME} << EOF
server {
    listen 80;
    server_name ${SERVER_HOST};

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${SERVICE_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "Step 11: Starting services..."
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo ""
echo "Step 12: Seeding initial data..."
sleep 3
curl -X POST http://localhost:5000/api/seed 2>/dev/null || echo "Seed may have already run"

echo ""
echo "=============================================="
echo "  Installation Complete!"
echo "=============================================="
echo ""
echo "Orchestrator URL: http://${SERVER_HOST}"
echo "Storage Path: ${STORAGE_PATH}"
echo ""
echo "Service commands:"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "Next steps:"
echo "  1. Set up SSL with: sudo certbot --nginx -d ${SERVER_HOST}"
echo "  2. Install daemons at each site pointing to https://${SERVER_HOST}"
echo ""
