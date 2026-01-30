# Color Routing System - Central Orchestrator

## Overview
A multi-site automated file routing and processing pipeline for video color correction workflows. This is the Central Orchestrator component that manages file transfers between three sites (Tustin, Nashville, Dallas), colorist workflow management, and MAM (Media Asset Management) integration.

## Tech Stack
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS + Shadcn UI
- **Backend**: Python FastAPI + asyncpg (proxied through Express for dev server)
- **Database**: PostgreSQL with asyncpg
- **State Management**: React Query for server state
- **Routing**: Wouter

## Project Structure
```
client/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── app-sidebar.tsx      # Main navigation sidebar
│   │   ├── file-details.tsx     # File details panel
│   │   ├── file-list.tsx        # File queue table
│   │   ├── recent-activity.tsx  # Activity feed
│   │   ├── site-status.tsx      # Site daemon status
│   │   ├── stats-cards.tsx      # Dashboard statistics
│   │   ├── status-badge.tsx     # State & site badges
│   │   ├── theme-provider.tsx   # Dark/light mode
│   │   └── ui/                  # Shadcn components
│   ├── pages/           # Route pages
│   │   ├── dashboard.tsx
│   │   ├── files.tsx
│   │   ├── transfers.tsx
│   │   ├── sites.tsx
│   │   ├── users.tsx
│   │   ├── audit.tsx
│   │   └── settings.tsx
│   └── App.tsx          # Main app with routing
server_python/
├── main.py              # FastAPI application with all routes
├── database.py          # asyncpg connection pool
├── storage.py           # Data access layer
└── models.py            # Pydantic models
server/
├── index.ts             # Express dev server (spawns Python, proxies /api)
├── vite.ts              # Vite dev server setup
└── static.ts            # Static file serving
shared/
└── schema.ts            # Database schema + types (Drizzle)
site_daemon/
└── daemon.py            # Python site daemon for file detection
```

## Site Daemon

The site daemon runs at each physical location (Tustin, Nashville, Dallas) to detect and report files to the central orchestrator.

### Running the Site Daemon
```bash
python site_daemon/daemon.py --site tustin --watch /path/to/watch
```

### CLI Options
- `--site`, `-s`: Site identifier (tustin, nashville, dallas) - required
- `--watch`, `-w`: Directory path to monitor for new files
- `--orchestrator`, `-o`: URL of central orchestrator (default: http://localhost:5000)
- `--api-key`, `-k`: API key for authenticating with orchestrator (or set DAEMON_API_KEY env var)
- `--metadata-only`: Only report metadata, don't upload files

### Features
- File detection using watchdog library
- SHA256 hash computation for file validation
- Automatic heartbeat reporting every 30 seconds
- Async queue processing for detected files

## Database Schema

### Tables
- **files**: Tracked files with state machine (9 states)
- **users**: System users with roles (admin, colorist, engineer, readonly)
- **sites**: Site daemon configuration (tustin, nashville, dallas)
- **audit_logs**: Complete audit trail
- **transfer_jobs**: RaySync transfer job tracking

### File State Machine
```
detected → validated → queued → transferring → transferred → 
colorist_assigned → in_progress → delivered_to_mam → archived
                                                    └→ rejected
```

## API Endpoints (Python FastAPI)

### Files
- `GET /api/files` - List all files
- `POST /api/files` - Register new file
- `POST /api/files/:id/validate` - Validate file
- `POST /api/files/:id/queue` - Queue for transfer
- `POST /api/files/:id/start-transfer` - Start RaySync transfer
- `POST /api/files/:id/complete-transfer` - Complete transfer
- `POST /api/files/:id/assign` - Assign to colorist
- `POST /api/files/:id/start` - Start color work
- `POST /api/files/:id/deliver` - Deliver to MAM
- `POST /api/files/:id/archive` - Archive file
- `POST /api/files/:id/reject` - Reject file
- `GET /api/files/:id/audit` - Get file audit trail

### Other Endpoints
- `GET /api/stats` - Dashboard statistics
- `GET /api/sites` - Site daemon status
- `POST /api/sites/:id/heartbeat` - Site heartbeat
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/audit` - Audit log entries
- `GET /api/transfers` - Transfer jobs
- `POST /api/seed` - Seed demo data

## Development

### Running the App
```bash
npm run dev
```
This starts Express on port 5000 which:
1. Spawns Python FastAPI server on port 5001
2. Proxies /api/* requests to Python
3. Serves Vite dev server for frontend

### Database Migrations
```bash
npm run db:push
```

### Initial Data
Visit `POST /api/seed` to populate demo data:
- 3 sites (Tustin, Nashville, Dallas)
- 3 users (2 colorists, 1 admin)
- Sample files in various states

## User Preferences
- Dark mode enabled by default
- Modern, clean UI with professional aesthetic
- Color scheme: Blue primary (#0ea5e9), dark sidebar

## Authentication

The system uses cookie-based session authentication for users and API key authentication for site daemons.

### User Authentication
- Users log in with username/password
- Passwords are hashed with bcrypt
- Sessions are stored in the database with 7-day expiry
- Session cookies are httponly with secure flag in production

### Daemon Authentication
- Site daemons authenticate using X-API-Key header
- Set DAEMON_API_KEY environment variable to enable
- Daemons can access: POST /api/files, POST /api/files/upload, GET /api/sites, POST /api/sites/:id/heartbeat

### Auth Endpoints
- `POST /api/auth/login` - User login (returns session cookie)
- `POST /api/auth/logout` - User logout (clears session)
- `GET /api/auth/me` - Get current user info

## Recent Changes
- 2026-01-30: Added user authentication system
  - Password hashing with bcrypt
  - Cookie-based session management
  - Login page and logout button
  - Protected API routes with user or daemon auth
  - Daemon API key support for site daemons
- 2026-01-30: Added Python site daemon for file detection
  - Watches directories for new video files
  - Computes SHA256 hashes for validation
  - Reports detected files to central orchestrator
  - Sends periodic heartbeats to maintain site status
- 2026-01-29: Migrated backend from Express.js to Python FastAPI
  - All API endpoints now handled by FastAPI
  - Express serves as dev server and proxy to Python
  - asyncpg for database connections
