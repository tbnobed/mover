# Color Routing System - Central Orchestrator

## Overview
A multi-site automated file routing and processing pipeline for video color correction workflows. This is the Central Orchestrator component that manages file transfers between three sites (Tustin, Nashville, Dallas), colorist workflow management, and MAM (Media Asset Management) integration.

## Tech Stack
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
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
server/
├── db.ts                # Database connection
├── routes.ts            # API endpoints
├── storage.ts           # Data access layer
└── index.ts             # Express server
shared/
└── schema.ts            # Database schema + types
```

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

## API Endpoints

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
The app runs on port 5000.

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
