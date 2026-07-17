# TraceGov — Project Progress

Source of truth for resuming work across sessions. Read this + CLAUDE.md first each session. Architecture details live in CLAUDE.md. Update this file after every meaningful milestone.

## Project overview

TraceGov — government file-tracking system (monorepo: `backend/` Node+Express+MongoDB, `ai-service/` FastAPI, `frontend/` React 19 + Vite 8 + Tailwind v4). Design target: institutional gov-tech (Stripe/Linear/Gov.uk).

## Current Git branch

`feature/prototype` (PRs target `main`). Current redesign work is **uncommitted** in the working tree. Note: `frontend/public/favicon.svg` has an unrelated pre-existing modification — do not revert or commit blindly.

---

# CURRENT EFFORT: Declutter + Consistency Redesign (approved plan)

User goals: declutter everything (landing/login included), consistent design + better UX, header **notification bell** (badge count + dropdown popup of files pending at officer's desk with dwell times, auto-refresh), make the fabricated admin weekly chart **real** via backend aggregation, remove unnecessary things completely. Full plan file: `~/.claude/plans/binary-percolating-lerdorf.md`.

## Phase status

| Phase | Status |
|---|---|
| 1. Backend (inbox scope/limit, /stats/weekly, api.js) | ✅ done |
| 2. UI foundation (time/hooks utils, Alert, Popover, Timeline fix, NotificationBell) | ⏳ in progress |
| 3. AppShell (mount bell, remove kicker, dedupe user pill, nav icon) | pending |
| 4a. Pages: Login, RegisterFile, OfficerInbox, AIInsights | pending |
| 4b. Pages: CitizenTrack, OfficerDashboard, AdminDashboard, Landing | pending |
| 5. Cleanup CSS dead code + enforcement greps + verify | pending |

## Completed in this effort

### Phase 1 — Backend ✅
- `backend/src/controllers/fileController.js` — `getOfficerInbox` accepts `?scope=desk|ward` (desk filters `currentLocation === req.user.deskLocation`), `?limit=N` (cap 200), `.select(...)` trims payload; populate only for ward scope. Dwell anchor = File `updatedAt`.
- `backend/src/controllers/statsController.js` — new `getWeeklyThroughput`: last-7-days MovementHistory aggregation grouped by server-local-timezone day; ward-scoped via `File.find({wardCode}).distinct('_id')` (MovementHistory has no wardCode — same pattern as dashboard summary); admins may pass `?allWards=true`; zero-filled response `{success, days:[{date,label,count}]}`.
- `backend/src/routes/stats.js` — `GET /api/stats/weekly` behind `authenticate, authorize('officer','admin')`; `/public` stays open.
- `backend/src/models/MovementHistory.js` — unchanged (timestamp already indexed).
- `frontend/src/lib/api.js` — `getOfficerInbox(params)` takes query params; added `getWeeklyThroughput(params)`; renamed `deleteDepartment` → `toggleDepartment`; deleted unused `analyzeDocument` + `citizenMessage`; fixed stale JSDoc.

### Phase 2 — UI foundation (done so far)
- `frontend/src/lib/time.js` NEW — `timeAgo()`, `dwellLabel()`.
- `frontend/src/lib/hooks.js` NEW — `usePolling(fn, intervalMs, {enabled})`, visibility-aware.
- `frontend/src/components/ui/index.jsx`:
  - Design-standard comment block at top (labels=`text-xs` only; Card `p-6` default / `p-0` tables / `p-4` compact rows; `space-y-8` pages; Badge=status, Chip=neutral metadata).
  - `STATUS_STYLES`: removed `Success`, added `Active` (emerald) + `Inactive` (slate) + STATUS_DOT entries.
  - `Chip`: removed unused `active` prop. `StatCard`: removed unused `delta` prop + `p-5` override.
  - NEW `Alert({tone, title, children})` (error/warning/success/info; role="alert" on error/warning).
  - NEW `Popover({trigger, children, align, open, onOpenChange})` — render-prop trigger, outside-click + Esc close, focus return to trigger.
  - `Timeline` auto-injects `last` into its final child.

## Current task

Phase 2 remainder:
1. Delete dead `ActivityTicker` from `ui/index.jsx` (bottom of file; uses `animate-marquee`).
2. Create `frontend/src/components/NotificationBell.jsx`: `usePolling` 60s on `api.getOfficerInbox({scope:'desk', limit:8})`; Bell trigger + red count badge (`9+` cap, hidden at 0, `aria-label` with count); Popover panel w-80 — header "Pending at your desk", ≤8 rows (title truncated, `Badge status`, `fileUid · dwellLabel(updatedAt)`), row click navigates `/officer?file=<fileUid>` and closes; footer "View inbox →" Link to `/inbox`; empty state "Your desk is clear."; refetch on open.

## Remaining tasks

- **Phase 3 — AppShell** (`frontend/src/components/layout/index.jsx`): mount `<NotificationBell user={user}/>` between ThemeToggle and user pill; delete `kicker` prop + all page call sites; collapse duplicated mobile/desktop user-pill markup into one responsive node; swap Inbox nav icon from `Icons.Bell` to a new tray glyph (add to `Icons`).
- **Phase 4a**: LoginPage (shared `Tabs` role toggle, `Alert`, remove glow blob); RegisterFilePage (`PageHeading`+breadcrumbs, `Alert`, normalize padding); OfficerInbox (remove "All ward" tab, `scope:'desk'` for My desk so page and bell agree, dwell labels per row, **oldest-first default sort**, `usePolling` 60s, Ward-queues card stays here as its single home); AIInsights (plain language: λ→"Files arriving per day", μ→"Files processed per day", ρ→"Desk load"; delete M/M/1 prose; use `BarList` component; `Alert`).
- **Phase 4b**: CitizenTrackPage (STEP_INDEX map for all 9 statuses → rail `Received/In processing/Decision/Dispatched`; Backtracked/Returned=needs-correction at step 1, Rejected=red terminal at step 2; consolidate 5 result cards → 2; status shown exactly once); OfficerDashboard (**highest regression risk — restructure only, don't touch search/scan/mutation logic**: delete non-functional Assign-officer select + orphaned officers fetch, shared `Tabs`, remove Ward-queues sidebar card, `Badge status="Verified" dot` for ledger pill, `dl` rows for AI mini-tiles, Timeline `last` cleanup); AdminDashboard (real weekly chart via `api.getWeeklyThroughput({allWards:true})`, delete `WEEK_WEIGHTS` + fabricated memo, labeled Activate/Deactivate `Button variant="outline"` using **`api.toggleDepartment`**, `Badge status="Active"/"Inactive"`, dedupe Overview table+mobile-card duplication into one `p-0` Card table with `overflow-x-auto`, split context-switching primary button per tab, `Alert`); LandingPage (delete 3 glow blobs/gradient text/ping/CTA repetition; hero + one bottom CTA band only; rebuild CtaBand without `!important`; target ≤300 lines).
- **Phase 5**: purge `frontend/src/index.css` dead utilities after grep-confirm (`.bg-grid`, `.bg-dots`, mask utils, `slide-in-left`/`marquee`/`draw-line` keyframes, `--animate-marquee`); enforcement greps (`text-\[9px\]|text-\[10px\]|text-\[11px\]` — bell badge count exempt, `animate-ping`, Card `p-5|p-8`, `Success` status usage); build + lint + manual verification.

## Known issues / TODOs

- **`AdminDashboard.jsx` still calls `api.deleteDepartment`** (renamed to `toggleDepartment`) — will throw at runtime until its Phase 4b redesign. Fix there.
- Bash tool was temporarily unavailable — backend not yet syntax-checked, frontend not yet rebuilt. At next opportunity: `node --check backend/src/controllers/{statsController,fileController}.js backend/src/routes/stats.js`; `npm run build --workspace=frontend`; `cd frontend && npx oxlint`.
- Grep pages for `Badge status="Success"` (style entry removed).

## Architectural decisions (this effort)

- Notifications reuse `GET /files/inbox?scope=desk` — no new endpoint; dwell = File `updatedAt`.
- Weekly chart scoped through file ids; aggregation buckets in server-local tz to align with zero-fill.
- `Popover` is a generic ui primitive; `NotificationBell` composes it in its own file.
- `StatCard` is the ONLY stat tile; subordinate stats = `dl` rows inside cards.
- Inbox page is the single home of the Ward-queues card (removed from OfficerDashboard).
- AI split: AIInsights = ward-level analytics; OfficerDashboard AI tab = file-specific only.

## Resume instructions

1. Read this file + CLAUDE.md; check the session task list (6 phase tasks) if present.
2. `git status`/`git diff` to confirm uncommitted work matches "Completed in this effort".
3. Continue from **Current task**; follow phase order. Verify after each phase: `npm run build --workspace=frontend`, `cd frontend && npx oxlint`, manual flows (seed logins `officer@ward.gov.np/officer123`, `admin@ward.gov.np/admin123`; `npm run dev` from root; frontend proxies `/api` → `localhost:4000`).
4. Update this file after each milestone and before ending any session.

---

# PRIOR MILESTONES (pre-redesign history)

- Full codebase audit (React 19 / Vite 8 / Tailwind v4 / RR7, no Framer Motion).
- Design system: Navy/Slate/Emerald tokens, animations, utilities in `index.css`.
- UI kit (`components/ui/index.jsx`): Container, Card, Button, Input, Textarea, Select, Badge, Chip,
  StatCard, Spinner, Skeleton, EmptyState, Modal, Timeline, Reveal, useCountUp, ToastProvider, Icons, SectionLabel.
- `ThemeProvider`/`useTheme`, `AppShell`/`PageHeading`/`Logo`/`ThemeToggle` layout.
- Fixed crash bugs: LoginPage missing `Link` import; AdminDashboard missing `Modal/Input/Select`.
- Landing page (hero, stats, features, how-it-works, workflows, benefits, testimonials, FAQ, CTA, footer).
- Redesigned all pages to design system: Login, CitizenTrack, Officer, RegisterFile, AIInsights, Admin.
  Skeleton loading, EmptyStates, toast feedback (replaced all `alert()`), responsive, a11y focus states.
- Fixed state rendering crash in `AIInsightsDashboard.jsx`.
- Bundle optimization: route-level code splitting via `React.lazy`/`Suspense` in `App.jsx`.
- Citizen Extras: recent searches caching in `localStorage`, status auto-refresh with browser notifications.
- Backend Hardening: custom security header middleware, stricter rate-limits on public routes.
- Database Schema Optimizations: target indexes on `File` and `MovementHistory`.
- Schema-based request input validation middlewares.
- Officer inbox/queue view: `/api/files/inbox` API + `OfficerInbox.jsx`.
- Admin department configuration: `Department` collection, CRUD routes, dynamic validation, admin UI.
- Dynamic SVG Column Charts: `BarChart` with hover tooltips and grid lines.
- Session Recovery Redirect: 401 handlers clean stale sessions and force login.
- Standalone Database Compatibility: `forwardFile`/`backtrackFile` fall back to non-transactional writes.
- Custom Routing Action / Status Updates: "Update file status" select in Officer Forward workspace.
- Unified Status Enums: `FILE_STATUSES`/`ACTION_TYPES` synchronized (Under Review, Verified).
- Secure Session Lifecycles: auth store migrated `localStorage` → `sessionStorage`.
- Collision-Resistant Unique Identifiers: verify-loops for `fileUid`/`trackingId`.
- Active Processing UI Pulsar: removed header activity ticker; added inline ping dots (being removed again in current redesign — inconsistent semantics).
- Fixed Citizen Tracking blank-page crash (missing `useEffect` import).
- Flexible Citizen Tracking: lookup by `trackingId` or `fileUid`.
- Build passed clean; committed as `dd9b3d0 "improved UI"`. Later commits: `25754fe`, `44ff9a3`, `05c12ec`, `f535516`.
- Added CLAUDE.md (architecture + conventions).

## Notes
- On-disk architecture is the Navy design-system structure in `src/pages/` (NOT `src/features/`). Do not migrate without explicit ask.
- Use `useToast`, `Skeleton`, `EmptyState`. Never `alert()` or hardcoded hex.
- Backend statuses/desks and seed logins documented in CLAUDE.md.
