# TraceGov

AI-powered QR file tracking prototype for Nepal's Ward Offices — a digital shadow for the manual Darta-Chalani system.

## Architecture

```
TraceGov/
├── backend/       # Node.js + Express + MongoDB (REST API, audit trail)
├── frontend/      # React + Tailwind (Scan-and-Go officer UI, citizen portal)
└── ai-service/    # Python FastAPI (OCR document checks, queueing predictions)
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or Docker)

### 1. Start MongoDB

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
npm install
cd ai-service && pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
```

### 4. Run services

```bash
# Terminal 1 — API (port 4000)
npm run dev:backend

# Terminal 2 — Frontend (port 5173)
npm run dev:frontend

# Terminal 3 — AI service (port 8000)
npm run dev:ai
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **QR-Handshake** | Unique `FileUID` + QR payload on registration for chain-of-custody |
| **Bidirectional Workflow** | Forward movement + Smart Backtracking with rejection reasons |
| **Immutable Logs** | SHA-256 hash chain on `MovementHistory` — tamper-evident |
| **RBAC** | Citizen (tracking only), Officer (scan/move), Admin (full access) |
| **AI Insights** | Missing-document OCR checks, M/M/1 completion time estimates |

## API Overview

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/files/register` | Officer | Register file, generate QR |
| GET | `/api/files/scan/:fileUid` | Officer | Lookup by QR payload |
| POST | `/api/files/:id/forward` | Officer | Forward to next desk |
| POST | `/api/files/:id/backtrack` | Officer | Return for corrections |
| GET | `/api/track/:trackingId` | Public | Citizen status (no internal notes) |
| POST | `/api/ai/analyze-document` | Officer | OCR missing-doc check |
| POST | `/api/ai/estimate-completion` | Public | M/M/1 time estimate |

## Performance Targets

- Status updates and search queries: **< 2 seconds**
- MongoDB indexes on `fileUid`, `trackingId`, `fileId` + `timestamp`

## License

Prototype — internal use only.
