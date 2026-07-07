# TraceGov

AI-powered QR file tracking system for Nepal's Ward Offices — providing transparency and digital audit logs for manual paper routing workflows.

---

## Restructured Architecture

We have refactored TraceGov from a prototype into a production-grade, modular codebase. It uses a clean MVC controller-service separation on the backend and a premium, responsive UI design on the frontend.

```
TraceGov/
├── backend/
│   ├── src/
│   │   ├── config/        # Database initialization & configurations
│   │   ├── models/        # Schemas with immutability pre-save locks
│   │   ├── middleware/    # Token authenticators & unified error boundaries
│   │   ├── services/      # Cryptographic chaining, QR tools, and AI proxies
│   │   ├── controllers/   # Decoupled handlers (auth, files, track)
│   │   ├── routes/        # Pure route definitions bound to controllers
│   │   └── index.js       # App boots, rate-limiting, and performance loggers
│   └── scripts/
│       └── seed.js        # Seed accounts for developer workspaces
├── frontend/
│   ├── src/
│   │   ├── components/ui/ # Reusable UI components & custom SVG vector set
│   │   ├── lib/           # Session states and API wrapper fetch client
│   │   ├── pages/         # Redesigned premium typography-first pages
│   │   └── index.css      # Core tailwind v4 layout theme custom colors
└── ai-service/        # FastAPI python OCR, delays prediction, queue estimates
```

---

## Quick Start (Local Run)

You can run TraceGov directly on your local machine without needing Docker.

### 1. Prerequisites
- **Node.js**: v18+ installed
- **Python**: v3.10+ installed
- **MongoDB**: Installed locally (e.g. via Homebrew: `brew install mongodb-community`)

### 2. Startup Database
Start your local MongoDB service:
```bash
brew services start mongodb-community
```

### 3. Install Dependencies
Install dependencies for both the Node packages and python requirements:
```bash
npm run install:all
```

### 4. Setup Environment Variables
Initialize the configuration files:
```bash
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
```
*(Make sure the `JWT_SECRET` in `backend/.env` is set correctly for local testing)*

### 5. Seed Developer Accounts
Seed credentials to log in:
```bash
cd backend && npm run seed && cd ..
```

### 6. Boot App Services
Run the concurrent dev script to start the backend (port 4000), frontend (port 5173), and AI FastAPI microservice (port 8000) all at once:
```bash
npm run dev
```

---

## Core System Operations

| Concept | Implementation Details |
|---------|------------------------|
| **Cryptographic Ledger** | Immutable audit logs in `MovementHistory` chained together via SHA-256 hashes. Updates and deletes are blocked. |
| **QR-Handshake** | Serialized tags generated on file registration. Decoded using device webcams via `html5-qrcode`. |
| **Resilient AI Estimates** | Expected process delays calculated using M/M/1 queuing. If the Python AI service goes offline, the backend falls back to local averages. |
| **Design Language** | Apple/Notion/Linear inspired theme with deep greens and dark/light modes. |

---

## Primary API Routes

| Verb | Endpoint | Authentication | Description |
|------|----------|----------------|-------------|
| POST | `/api/auth/register` | Public | Registers a new officer account |
| POST | `/api/auth/login` | Public | Authenticators log in, role checks |
| GET  | `/api/auth/officers` | Staff Only | Roster lists for routing redirections |
| POST | `/api/files/register` | Staff Only | Creates record and generates QR tag |
| GET  | `/api/files/scan/:identifier` | Staff Only | Scans QR tag or query manual file UID |
| POST | `/api/files/:id/forward` | Staff Only | Routes folder to the next location |
| POST | `/api/files/:id/backtrack` | Staff Only | Bounces file back for corrections |
| GET  | `/api/track/:trackingId` | Public | Public citizen status queries |
| GET  | `/api/ai/bottlenecks` | Staff Only | Department dwell times statistics |
```
