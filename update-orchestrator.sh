#!/bin/bash

set -e

INSTALL_DIR="/opt/color-routing-orchestrator"
SERVICE_NAME="color-routing-orchestrator"

echo "=============================================="
echo "  Color Routing System - Orchestrator Update"
echo "=============================================="
echo ""

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "Error: Installation not found at $INSTALL_DIR"
  echo "Please run install-orchestrator.sh for fresh installation"
  exit 1
fi

echo "This script will update the Color Routing Orchestrator."
echo "Your data and configuration will be preserved."
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
cp ${INSTALL_DIR}/.env ${INSTALL_DIR}/.env.backup

echo ""
echo "Step 3: Pulling latest code..."
cd "$INSTALL_DIR"
git fetch origin
git reset --hard origin/main

echo ""
echo "Step 4: Restoring environment file..."
cp ${INSTALL_DIR}/.env.backup ${INSTALL_DIR}/.env

echo ""
echo "Step 5: Installing Node.js dependencies..."
npm install

echo ""
echo "Step 6: Updating Python dependencies..."
${INSTALL_DIR}/venv/bin/pip install --upgrade fastapi uvicorn asyncpg pydantic aiofiles python-multipart bcrypt

echo ""
echo "Step 7: Clearing Python cache..."
find ${INSTALL_DIR} -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

echo ""
echo "Step 8: Building frontend..."
npm run build

echo ""
echo "Step 9: Running database migrations..."

# Load environment for database connection
source ${INSTALL_DIR}/.env

# Extract database connection info
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

echo "Creating new tables if needed..."

# Create retransfer_tasks table (new in this update)
# Note: file_id is VARCHAR to match files.id type
PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "
CREATE TABLE IF NOT EXISTS retransfer_tasks (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  site_id VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  sha256_hash VARCHAR NOT NULL,
  orchestrator_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  daemon_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);
" 2>/dev/null || echo "retransfer_tasks table already exists"

# Grant permissions on the new table and sequence
PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U postgres -d ${DB_NAME} -c "
GRANT ALL ON TABLE retransfer_tasks TO ${DB_USER};
GRANT ALL ON SEQUENCE retransfer_tasks_id_seq TO ${DB_USER};
" 2>/dev/null || echo "Permissions already granted or using correct user"

# Ensure cleanup_tasks has required columns
PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "
ALTER TABLE cleanup_tasks ADD COLUMN IF NOT EXISTS site_id VARCHAR;
ALTER TABLE cleanup_tasks ADD COLUMN IF NOT EXISTS file_path VARCHAR;
ALTER TABLE cleanup_tasks ADD COLUMN IF NOT EXISTS orchestrator_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE cleanup_tasks ADD COLUMN IF NOT EXISTS daemon_deleted BOOLEAN DEFAULT FALSE;
" 2>/dev/null || echo "cleanup_tasks columns already exist"

# Ensure file_history table exists
PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "
CREATE TABLE IF NOT EXISTS file_history (
  id VARCHAR PRIMARY KEY,
  sha256_hash VARCHAR UNIQUE NOT NULL,
  filename VARCHAR NOT NULL,
  source_site VARCHAR NOT NULL,
  file_size BIGINT NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_file_history_hash ON file_history(sha256_hash);
" 2>/dev/null || echo "file_history table already exists"

echo "Database migrations complete."

echo ""
echo "Step 10: Starting service..."
systemctl daemon-reload
systemctl start ${SERVICE_NAME}

echo ""
echo "Waiting for service to start..."
sleep 5

echo ""
echo "Step 11: Verifying update..."
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
echo "  - Retransfer: Re-initiate file transfers for rejected files"
echo "  - Cleanup: Delete source files after MAM delivery"
echo "  - Revert: Move files back one workflow step"
echo ""
echo "Service commands:"
echo "  sudo systemctl status ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "IMPORTANT: Update site daemons at each location:"
echo "  Run: sudo /opt/color-routing-daemon/update-daemon.sh"
echo ""
