# TraceGov

**QR-based government file tracking system with cryptographically verifiable audit trails and AI-assisted processing insights.**

TraceGov digitizes the manual paper-file routing workflow used in ward/municipal government offices. Every physical file is registered once, tagged with a QR code, and then tracked as it physically moves between desks — while citizens can check their file's status online without visiting the office.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Backend](#running-the-backend)
- [Running the Frontend](#running-the-frontend)
- [Running the AI Service](#running-the-ai-service)
- [Database Seeding](#database-seeding)
- [Demo Accounts](#demo-accounts)
- [API Overview](#api-overview)
- [QR Workflow](#qr-workflow)
- [Ledger Integrity](#ledger-integrity)
- [AI Module](#ai-module)
- [Screenshots](#screenshots)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Project Overview

Government ward offices in many regions still route physical paper files (citizenship applications, land certificates, tax clearances, etc.) by hand between desks, with no digital record of where a file is or how long it took to process. TraceGov addresses this by:

1. **Registering** a physical file once at intake, generating a unique QR-tagged identity for it.
2. **Tracking** the file as officers **forward** or **backtrack** it between desks, with every movement permanently logged.
3. **Exposing** that status to citizens through a public tracking page — no login required.
4. **Assisting** officers and administrators with AI-derived insights: document completeness checks, delay/risk prediction, and queue analytics.

The system is built as three cooperating services — a React frontend, a Node.js/Express API, and a Python FastAPI AI microservice — backed by MongoDB.

---

## Key Features

- **QR-based file registration** — each file gets a unique human-readable UID (`TG-YYYYMMDD-XXXXXXXX`), a citizen-facing tracking ID, and a scannable QR code at intake.
- **Officer & Admin dashboards** — role-based views for ward officers (inbox, forward/backtrack, dashboard summary) and administrators (officer management, department management, ward-wide analytics).
- **Public citizen tracking portal** — look up a file's current status and history by tracking ID, without authentication.
- **Immutable, hash-chained movement ledger** — every forward/backtrack action is written to an append-only, SHA-256 hash-chained log that can be cryptographically re-verified for tampering.
- **Ward-scoped data isolation** — officers only see files, queues, and movement data belonging to their own ward; administrators can view all wards.
- **AI-assisted document analysis** — OCR-based keyword/document-type detection with a deterministic local fallback if the AI service is unreachable.
- **AI-assisted delay & queue prediction** — M/M/1 queueing-theory based completion-time estimates, with a local heuristic fallback in the Node backend.
- **Department/desk management** — admins can configure the desks (departments) that exist within their ward.
- **Rate limiting & security headers** — dedicated stricter limits on authentication and public tracking endpoints, plus custom security headers on every response.
- **Demo data seeding** — an opt-in script that populates multiple wards, officers, and files across every status for realistic dashboard demonstrations.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite, `html5-qrcode` (QR scanning) |
| Backend API | Node.js, Express 4, Mongoose 8 (MongoDB ODM), JSON Web Tokens, bcryptjs |
| AI Microservice | Python, FastAPI, Uvicorn |
| Database | MongoDB |
| Tooling | npm workspaces, `concurrently` (multi-service dev orchestration), oxlint |

---

## Architecture Overview

```
┌─────────────────┐        REST/JSON         ┌──────────────────────┐
│  React Frontend  │ ───────────────────────▶ │   Express Backend    │
│  (Vite, :5173)    │ ◀─────────────────────── │       (:4000)         │
└─────────────────┘                          └──────────┬───────────┘
                                                          │
                                     REST/JSON (internal) │  Mongoose
                                                          ▼
                                              ┌──────────────────────┐
                                              │  FastAPI AI Service   │
                                              │       (:8000)         │
                                              └──────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────┐
                                              │       MongoDB         │
                                              └──────────────────────┘
```

- The **frontend** never calls the AI service directly; all AI requests are proxied through the Express backend (`/api/ai/*`), which also handles auth and ward scoping.
- The **backend** calls the AI service over HTTP for OCR, delay prediction, and smart-backtrack suggestions. If the AI service is unreachable or errors, the backend's `aiService.js` transparently falls back to local heuristics so the app keeps working.
- The **audit ledger** (`MovementHistory`) is written exclusively through a dedicated service (`ledgerService.js`) that computes chained SHA-256 hashes — it is never written to directly by controllers.

---

## Folder Structure

```
TraceGov/
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB connection setup
│   │   ├── controllers/     # Route handler logic (auth, files, track, departments)
│   │   ├── middleware/      # JWT auth/authorize, validation, security headers, error handler
│   │   ├── models/          # Mongoose schemas: User, File, MovementHistory, Department
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # cryptoService, ledgerService, qrService, aiService (AI proxy + fallback)
│   │   └── index.js         # App entrypoint: middleware, rate limiting, route mounting
│   ├── scripts/
│   │   ├── seed.js                        # Core + optional demo data seeding
│   │   └── migrate-drop-stale-index.js    # One-time legacy index cleanup
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/       # Shared shell/navigation components
│   │   │   └── ui/           # Reusable UI primitives
│   │   ├── lib/
│   │   │   ├── api.js        # fetch-based API client (attaches JWT bearer token)
│   │   │   └── theme.jsx     # Theme/dark-mode context
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── CitizenTrackPage.jsx      # Public tracking portal
│   │   │   ├── OfficerDashboard.jsx
│   │   │   ├── OfficerInbox.jsx
│   │   │   ├── RegisterFilePage.jsx
│   │   │   ├── AIInsightsDashboard.jsx
│   │   │   └── AdminDashboard.jsx
│   │   ├── App.jsx           # Route definitions & role-based route guards
│   │   └── main.jsx
│   └── package.json
├── ai-service/
│   ├── main.py               # FastAPI app: OCR, prediction, and queue endpoints
│   ├── requirements.txt
│   └── .env.example
├── package.json               # Root workspace orchestration (concurrently dev script)
└── README.md
```

---

## Installation

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB** running locally or accessible via connection string

### Steps

```bash
# 1. Clone the repository
git clone <repository-url>
cd TraceGov

# 2. Install all dependencies (Node workspaces + Python requirements)
npm run install:all

# 3. Configure environment variables (see below)
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env

# 4. Seed initial accounts and departments
cd backend && npm run seed && cd ..

# 5. Start all three services together
npm run dev
```

`npm run dev` (root) uses `concurrently` to start the backend, frontend, and AI service in parallel from a single terminal.

---

## Environment Variables

### `backend/.env`

| Variable | Description | Example |
|---|---|---|
| `PORT` | Port the Express API listens on | `4000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/tracegov` |
| `JWT_SECRET` | Secret used to sign/verify JWTs — **must be changed for any real deployment** | `change-me-in-production-use-long-random-string` |
| `AI_SERVICE_URL` | Base URL of the FastAPI AI microservice | `http://localhost:8000` |
| `CORS_ORIGIN` | Allowed origin for CORS (the frontend URL) | `http://localhost:5173` |

### `ai-service/.env`

| Variable | Description | Example |
|---|---|---|
| `HOST` | Bind host for the FastAPI/Uvicorn server | `0.0.0.0` |
| `PORT` | Port the AI service listens on | `8000` |

The frontend does not require its own `.env` file; the API base URL is resolved by `frontend/src/lib/api.js`.

---

## Running the Backend

```bash
cd backend
npm install
npm run dev     # starts with --watch (auto-restart on file changes)
# or
npm start       # plain node start, no watch
```

The API starts on `http://localhost:4000` (or `PORT` from `.env`), with a health check at `GET /health`.

---

## Running the Frontend

```bash
cd frontend
npm install
npm run dev       # Vite dev server, default http://localhost:5173
npm run build     # production build
npm run preview   # preview the production build locally
```

---

## Running the AI Service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The AI service exposes a `GET /health` endpoint. If it is not running, the backend automatically falls back to local heuristic logic for AI-dependent features rather than failing requests — see [AI Module](#ai-module).

---

## Database Seeding

The seed script (`backend/scripts/seed.js`) supports three modes:

```bash
# Core seed only — 7 departments + 2 login accounts for Ward W01.
# Safe to run repeatedly; skips anything that already exists.
npm run seed --workspace=backend

# Core seed + realistic demo data: a second ward (W02), additional
# officer/admin accounts, and 12 files spanning every status with
# properly hash-chained movement history.
npm run seed:demo --workspace=backend

# Same as above, but first clears any previously seeded demo files
# and their ledger entries (reserved to a dedicated demo phone-number
# range, so real data is never touched). Refuses to run when
# NODE_ENV=production.
npm run seed:demo:reset --workspace=backend
```

All demo `MovementHistory` entries are created through the same `appendMovementLog()` service used by the live API — never inserted directly — so the hash chain remains valid and passes ledger verification.

---

## Demo Accounts

### Core accounts (created by `npm run seed`)

| Role | Email | Password | Ward | Desk |
|---|---|---|---|---|
| Officer | `officer@ward.gov.np` | `officer123` | W01 | Reception |
| Admin | `admin@ward.gov.np` | `admin123` | W01 | Admin Office |

### Additional demo accounts (only created by `npm run seed:demo`)

| Role | Email | Password | Ward | Desk |
|---|---|---|---|---|
| Officer | `verification.w01@ward.gov.np` | `demo1234` | W01 | Verification Desk |
| Officer | `tax.w01@ward.gov.np` | `demo1234` | W01 | Tax Office Desk |
| Officer | `wardchair.w01@ward.gov.np` | `demo1234` | W01 | Ward Chair Section |
| Officer | `reception.w02@ward.gov.np` | `demo1234` | W02 | Baneshwor Reception |
| Officer | `verification.w02@ward.gov.np` | `demo1234` | W02 | Baneshwor Verification Desk |
| Admin | `admin.w02@ward.gov.np` | `demo1234` | W02 | Baneshwor Admin Office |

> These are development/demo credentials only. `JWT_SECRET` and all seeded passwords must be changed before any real deployment.

---

## API Overview

All endpoints are prefixed with `/api`. Authenticated routes require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | API health check |
| POST | `/api/auth/login` | Public | Log in and receive a JWT |
| POST | `/api/auth/register` | Admin only | Create a new officer/admin account |
| GET | `/api/auth/me` | Authenticated | Get the current session's user profile |
| GET | `/api/auth/officers` | Officer/Admin | List officers (for routing/assignment) |
| GET | `/api/files/inbox` | Officer/Admin | Open files in the officer's ward |
| POST | `/api/files/register` | Officer/Admin | Register a new physical file and generate its QR code |
| GET | `/api/files/search` | Officer/Admin | Search open files by query/status/ward |
| GET | `/api/files/dashboard/summary` | Officer/Admin | Ward dashboard metrics, queue, and recent activity |
| GET | `/api/files/scan/:identifier` | Officer/Admin | Look up a file by scanned QR payload or UID |
| POST | `/api/files/:id/forward` | Officer/Admin | Move a file to the next desk/status |
| POST | `/api/files/:id/backtrack` | Officer/Admin | Return a file for correction with a reason |
| GET | `/api/track/:trackingId` | Public | Citizen-facing file status lookup |
| GET | `/api/departments` | Authenticated | List departments/desks |
| POST | `/api/departments` | Admin only | Create a department |
| PUT | `/api/departments/:id` | Admin only | Update a department |
| DELETE | `/api/departments/:id` | Admin only | Remove a department |
| POST | `/api/ai/estimate-completion` | Public | Estimated completion time for a file |
| POST | `/api/ai/citizen-message` | Public | Human-readable status message for citizens |
| POST | `/api/ai/analyze-document` | Officer/Admin | OCR/document-type analysis |
| POST | `/api/ai/predict-delay` | Officer/Admin | Delay/risk prediction for a file |
| POST | `/api/ai/smart-backtrack` | Officer/Admin | Suggested backtrack destination |
| GET | `/api/ai/bottlenecks` | Officer/Admin | Ward-scoped desk dwell-time analysis |

Sensitive endpoints are additionally rate-limited: `/api/auth/login` and `/api/auth/register` (20 requests / 15 minutes), `/api/track/*` (30 requests / minute), and all other `/api/*` routes (150 requests / minute).

---

## QR Workflow

1. **Registration** — When an officer registers a file (`POST /api/files/register`), the backend generates:
   - A file UID in the format `TG-YYYYMMDD-XXXXXXXX`
   - A short citizen-facing tracking ID
   - A versioned JSON QR payload: `{ "v": 1, "uid": "<fileUid>", "ward": "<wardCode>", "ts": <timestamp> }`
   - A QR code image (as a base64 data URL) encoding that payload
2. **Physical tagging** — The generated QR image is intended to be printed and attached to the physical file.
3. **Scanning** — Officers scan the QR code from the frontend (using `html5-qrcode` via a device camera), or type the file UID manually.
4. **Lookup** — The scanned/typed value is sent to `GET /api/files/scan/:identifier`, which parses the payload (JSON or raw UID), looks up the `File` document, returns its current state and recent movement history, and reports whether its ledger chain is still valid.

---

## Ledger Integrity

Every file movement (registration, forward, backtrack) is recorded as an entry in the `MovementHistory` collection, but never through a direct `create()` call from a controller — always through `ledgerService.appendMovementLog()`, which:

1. Looks up the most recent entry for that file to obtain its `entryHash`.
2. Computes a new SHA-256 hash over the entry's core fields (file ID, officer ID, action type, location, timestamp, notes) plus the previous entry's hash — chaining each record to the one before it, similar to a blockchain.
3. Stores both the new `entryHash` and the `previousHash` it links to.

The `MovementHistory` schema additionally blocks all update and delete operations at the Mongoose level (`pre` hooks on `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `findOneAndUpdate`), so the ledger is append-only by construction, not just by convention.

`ledgerService.verifyLogChain(fileId)` walks a file's full history in chronological order, recomputes each hash, and confirms it matches both the stored `entryHash` and the expected `previousHash` — returning where the chain first breaks if it's been tampered with. This runs automatically whenever a file is scanned (`GET /api/files/scan/:identifier`).

---

## AI Module

The Python FastAPI service (`ai-service/main.py`) exposes:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Service health check |
| `POST /analyze-document` | OCR-based document analysis / keyword detection (English + Nepali/Devanagari) |
| `POST /estimate-completion` | Completion time estimate using M/M/1 queueing theory |
| `POST /predict-delay` | Delay/risk prediction for a file based on its movement history |
| `POST /smart-backtrack` | Suggests an appropriate desk to return a file to |
| `POST /citizen-message` | Generates a citizen-friendly status message |
| `POST /bottleneck-analysis` | Standalone dwell-time bottleneck analysis (not currently called by the Node backend, which computes its own equivalent via a MongoDB aggregation) |

**Resilience:** The Node backend's `aiService.js` calls this microservice over HTTP for `analyze-document`, `predict-delay`, `smart-backtrack`, and `estimate-completion`. If the AI service is unreachable, times out, or errors, `aiService.js` catches the failure and returns a locally computed fallback (heuristic risk scoring, simple keyword matching, or default completion estimates) instead of failing the request — so officer and citizen-facing features keep working even with the AI service offline.

**Nepali OCR:** The EasyOCR reader is initialized with both Nepali (`ne`) and English (`en`) models, so photographed Nepali documents (नागरिकता प्रमाणपत्र, सिफारिस पत्र, लालपुर्जा, कर रसिद, …) are read directly in Devanagari. Checklist keywords entered in English are matched against a built-in table of Nepali aliases (e.g. "Citizenship" also matches "नागरिकता", "Tax Receipt" also matches "कर रसिद"), document classification scores both scripts, and the response reports the detected language mix (`detectedLanguage`: `nepali` / `english` / `mixed`). The Devanagari model (~64 MB) is downloaded automatically by EasyOCR on the first scan, so expect the very first request to be slow; officers can upload a document photo from the Register File page to run the scan.

---

## Screenshots

> _Add screenshots or GIFs of the running application below._

| Landing Page | Login |
|---|---|
| _placeholder_ | _placeholder_ |

| Officer Dashboard | Officer Inbox |
|---|---|
| _placeholder_ | _placeholder_ |

| Register File (QR Generation) | QR Scan |
|---|---|
| _placeholder_ | _placeholder_ |

| Admin Dashboard | AI Insights Dashboard |
|---|---|
| _placeholder_ | _placeholder_ |

| Citizen Tracking Portal |
|---|
| _placeholder_ |

---

## Future Improvements

- Automated test suite (backend route/unit tests, ledger integrity tests, frontend component tests)
- OCR preprocessing (deskew/contrast normalization) to improve document analysis accuracy on photographed files
- Wire up or remove the currently unused `/api/ai/bottleneck-analysis` FastAPI endpoint
- SMS/email notifications to citizens on status changes
- Configurable per-ward workflow templates instead of fixed desk sequences
- Containerized deployment (Docker Compose) for all three services
- Structured application logging/monitoring for production environments

---

## License

This project is submitted as an academic final-year engineering project. Add your preferred open-source license (e.g., MIT) here, or mark it as proprietary/academic-use-only, before public distribution.