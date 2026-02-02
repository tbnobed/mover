# Color Routing System - Deployment Guide

## Production Server Details
- **Orchestrator**: 10.63.12.122
- **Service**: color-routing-orchestrator (systemd)
- **Install Dir**: /opt/color-routing-orchestrator

## Update Existing Production Installation

### Step 1: Update Orchestrator (on 10.63.12.122)

```bash
# SSH into production server
ssh root@10.63.12.122

# Navigate to install directory
cd /opt/color-routing-orchestrator

# Pull latest changes
git pull origin main

# Run the update script
./update-orchestrator.sh
```

Or manually:

```bash
# Stop service
sudo systemctl stop color-routing-orchestrator

# Pull latest code
cd /opt/color-routing-orchestrator
git pull origin main

# Install dependencies
npm install

# Update Python packages
./venv/bin/pip install --upgrade fastapi uvicorn asyncpg pydantic aiofiles python-multipart bcrypt

# Clear Python cache
find . -name "__pycache__" -type d -exec rm -rf {} +

# Build frontend
npm run build

# Run database migrations for new tables
psql -U color_routing -d color_routing -c "
CREATE TABLE IF NOT EXISTS retransfer_tasks (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  site_id VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  sha256_hash VARCHAR NOT NULL,
  orchestrator_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  daemon_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);
"

# Restart service
sudo systemctl restart color-routing-orchestrator

# Verify it's running
sudo systemctl status color-routing-orchestrator
sudo journalctl -u color-routing-orchestrator -f
```

### Step 2: Update Site Daemons (at each site)

For each site (Tustin, Nashville, Dallas):

```bash
# SSH into site daemon machine
ssh root@<site-ip>

# Navigate to install directory
cd /opt/color-routing-daemon

# Pull latest changes
git pull origin main

# Run update script
./site_daemon/update-daemon.sh
```

Or manually:

```bash
# Stop daemon
sudo systemctl stop color-routing-daemon

# Pull latest code
cd /opt/color-routing-daemon
git pull origin main

# Update Python packages
./venv/bin/pip install --upgrade watchdog aiohttp

# Clear Python cache
find . -name "__pycache__" -type d -exec rm -rf {} +

# Restart daemon
sudo systemctl restart color-routing-daemon

# Verify it's running
sudo systemctl status color-routing-daemon
sudo journalctl -u color-routing-daemon -f
```

## New Features in This Update

### Retransfer (for rejected files)
- Allows re-initiating file transfers for rejected files
- Click "Retransfer" button on any rejected file
- Orchestrator deletes its copy and removes from file history
- Daemon receives task on next heartbeat and re-uploads file

### Cleanup (for delivered files)
- Deletes source files after MAM delivery
- Click "Cleanup Source Files" on delivered files
- Orchestrator deletes its storage copy
- Daemon deletes local copy on next heartbeat

### Revert
- Move files back one step in the workflow
- Click "Revert" button on any file (except detected state)

## Database Tables Added

```sql
-- Retransfer tasks (new)
-- Note: file_id has NO foreign key - the file is deleted before the task is created
CREATE TABLE retransfer_tasks (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR NOT NULL,
  site_id VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  sha256_hash VARCHAR NOT NULL,
  orchestrator_deleted BOOLEAN DEFAULT FALSE,
  daemon_acknowledged BOOLEAN DEFAULT FALSE,
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- If you created the table with a foreign key, drop it:
ALTER TABLE retransfer_tasks DROP CONSTRAINT IF EXISTS retransfer_tasks_file_id_fkey;

-- Cleanup tasks (should already exist)
CREATE TABLE cleanup_tasks (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  site_id VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending',
  orchestrator_deleted BOOLEAN DEFAULT FALSE,
  daemon_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u color-routing-orchestrator -n 100

# Check Python syntax
./venv/bin/python -c "import server_python.main"
```

### Database migration fails
```bash
# Check PostgreSQL connection
psql -U color_routing -d color_routing -c "SELECT 1;"

# Manually run migrations
npm run db:push
```

### Daemon not processing tasks
```bash
# Check heartbeat is working
sudo journalctl -u color-routing-daemon -f

# Verify API key matches orchestrator
grep DAEMON_API_KEY /opt/color-routing-daemon/.env
grep DAEMON_API_KEY /opt/color-routing-orchestrator/.env
```
