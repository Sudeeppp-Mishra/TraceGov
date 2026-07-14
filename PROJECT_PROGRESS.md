# TraceGov — Project Progress

Source of truth. Read this + CLAUDE.md first each session. Architecture details live in CLAUDE.md.

# TODO

## Completed
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
- Bundle optimization: Implemented route-level code splitting using `React.lazy` and `Suspense` in `App.jsx`.
- Citizen Extras: Implemented recent searches caching in `localStorage` and status auto-refresh with browser notification integrations.
- Backend Hardening: Added custom security header middleware and stricter rate-limiting configurations for public routing.
- Database Schema Optimizations: Added target indexing rules to `File` and `MovementHistory` collections.
- Created robust schema-based request input validation middlewares.
- Officer inbox/queue view: Added dedicated `/api/files/inbox` API and updated `OfficerInbox.jsx` to fetch complete active file queues.
- Advanced admin department configuration panel: Added `Department` schema database collection, CRUD backend routes, dynamic validation checks, and admin interface for creation and deactivation.
- Dynamic SVG Column Charts: Upgraded `BarChart` component to render responsive SVG vectors with hover tooltips and horizontal grid lines.
- Session Recovery Redirect: Integrated automatic 401 Unauthorized API handlers to clean stale browser local storage states and force login.
- Standalone Database Compatibility: Refactored file routing updates (`forwardFile` and `backtrackFile`) to handle standalone local MongoDB installations, dynamically falling back to standard writes if replica sets are not configured.
- Custom Routing Action / Status Updates: Integrated a "Update file status" select element in the Officer Forward workspace, enabling officers to approve, verify, or dispatch files natively during desk handovers.
- Unified Status Enums: Synchronized status definitions (`FILE_STATUSES` and `ACTION_TYPES` in backend schemas) to allow `Under Review` and `Verified` status transitions.
- Secure Session Lifecycles: Migrated auth store from `localStorage` to `sessionStorage`. This automatically expires and destroys logged-in officer/admin sessions when browser tabs or windows are closed.
- Collision-Resistant Unique Identifiers: Added database verify-loops when registering files to ensure `fileUid` and `trackingId` properties are 100% unique, preventing database index collisions.
- Active Processing UI Pulsar: Removed header activity ticker. Added a dynamic, clean pulsing ping dot indicator inline next to active in-progress file titles in Officer/Admin/AI queues and searches (hiding it automatically once files reach completed/approved/dispatched status).
- Fixed Citizen Tracking Blank Page Crash: Added the missing `useEffect` hook import to `CitizenTrackPage.jsx` to resolve the ReferenceError crash that rendered the screen blank.
- Flexible Citizen Tracking: Configured public tracking lookups (`trackFile` inside `backend/src/controllers/trackController.js`) to support querying by either the `trackingId` or the full physical `fileUid` interchangeably.
- Build passes clean; committed as `dd9b3d0 "improved UI"`.
- Added CLAUDE.md (architecture + conventions).

## In Progress
- None

## Remaining (priority order)
- None

## Notes
- On-disk architecture is the Navy design-system structure in `src/pages/` (NOT `src/features/`). Do not migrate without explicit ask.
- Use `useToast`, `Skeleton`, `EmptyState`. Never `alert()` or hardcoded hex.
- Backend statuses/desks and seed logins documented in CLAUDE.md.
