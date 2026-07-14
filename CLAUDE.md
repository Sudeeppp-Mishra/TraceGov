# CLAUDE.md — TraceGov

Government file-tracking system. Digitizes physical file movement: citizens track applications, officers process them, every movement is on an immutable SHA-256 ledger. Design target: institutional gov-tech (Stripe/Linear/Gov.uk), not startup/SaaS.

## Monorepo
- `backend/` — Node + Express + MongoDB (JWT auth, files, track, ai routes). Statuses: `Received · Pending · Approved · Dispatched · Backtracked`. Desks: Reception, Verification Desk, Ward Chair Section, Tax Office Desk, Administrative Archives, Review Panel Office.
- `ai-service/` — FastAPI (OCR, M/M/1 queue estimates). Backend falls back to local averages if offline.
- `frontend/` — the focus of UI work.

## Frontend architecture (authoritative — on branch `feature/prototype`)
Stack: **React 19 · Vite 8 · Tailwind v4 (`@theme` in `src/index.css`) · React Router 7 · axios · html5-qrcode. No Framer Motion** — animations are CSS keyframes + IntersectionObserver (`Reveal`).

```
src/
  main.jsx                     ThemeProvider > ToastProvider > BrowserRouter > App
  App.jsx                      Routes. "/" = Landing, /track public, /officer /register-file /ai /admin protected
- `index.css`                    Design tokens (@theme), Navy/Slate/Emerald palette, animations, utilities
- `lib/`
  - `api.js`                     fetch wrapper + session helpers (getStoredUser, saveSession, clearSession)
  - `theme.jsx`                  ThemeProvider + useTheme (dark mode, localStorage)
- `components/`
  - `ui/index.jsx`               Design system barrel: Container, Card, Button, Input, Textarea, Select,
                                 Badge, Chip, StatCard, Spinner, Skeleton, EmptyState, Modal, Timeline,
                                 TimelineItem, Reveal, useCountUp, ToastProvider/useToast, Icons, SectionLabel
  - `layout/index.jsx`           Logo, ThemeToggle, AppShell (authed nav+shell), PageHeading
- `pages/`
  - `LandingPage.jsx`            Public marketing page (hero, stats, features, how, workflows, benefits,
                                 testimonials, FAQ, CTA, footer)
  - `LoginPage.jsx`              Split-panel auth, role tabs, demo-fill
  - `CitizenTrackPage.jsx`       Public tracking (search, progress rail, timeline, AI estimate, localStorage history cache, auto-refresh status checkbox)
  - `OfficerDashboard.jsx`       Workspace: metrics, search/scan, forward/backtrack/AI tabs, ledger timeline
  - `RegisterFilePage.jsx`       File registration + printable QR receipt
  - `AIInsightsDashboard.jsx`    M/M/1 stats, bottlenecks, high-risk watch, reallocation assistant
  - `AdminDashboard.jsx`         Stat cards, ledger integrity audit table, officer roster, add-officer modal

## Backend Architecture
- **Middlewares:**
  - `auth.js`                    JWT authentication and role verification
  - `security.js`                Custom secureHeaders middleware enforcing X-Frame-Options, CSP, XSS-Protection, and nosniff headers
  - `validation.js`              Payload input validation before handler entry (validateRegister, validateLogin, validateRegisterFile, validateForward, validateBacktrack)
  - `errorHandler.js`            Global JSON error wrapper

## Conventions
- Design tokens only: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-emerald-*` etc. Never hardcode hex in components.
- Palette: **primary = Deep Navy**, secondary = Slate, accent = Emerald. Status colors via `Badge status={...}`.
- Feedback: use `useToast()` not `alert()`. Loading = `Skeleton`. Empty/error = `EmptyState`.
- Authed pages wrap content in `<AppShell user={...}>`; use `PageHeading` for titles.
- Animations: `Reveal` for scroll-in, `animate-fade-up`/`animate-zoom-in` for mounts. Respect `prefers-reduced-motion` (handled in CSS).
- a11y: semantic HTML, `aria-*` on icon buttons, `:focus-visible` styled globally.
- Code Splitting: Authed portal pages should be dynamically loaded in `App.jsx` using `React.lazy` to keep the public bundle fast.
- Mock data is acceptable where backend endpoints are unavailable (per project brief).

## Commands
- Build: `npm run build --workspace=frontend` (workspace deps hoisted to root `node_modules`).
- Lint: `cd frontend && npx oxlint`.
- Dev (all): `npm run dev` from root. Frontend proxies `/api` → `localhost:4000`.
- Seed logins: `officer@ward.gov.np/officer123`, `admin@ward.gov.np/admin123`.
