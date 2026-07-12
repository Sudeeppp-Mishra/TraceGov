# TraceGov — Project Progress

Source of truth for autonomous work. Read this first every session.

## Stack
React 19 · Vite 8 · Tailwind v4 (`@theme` in `src/index.css`) · React Router 7 · axios · html5-qrcode. **No Framer Motion** — animations are CSS + IntersectionObserver.

## Architecture
- `src/index.css` — design tokens (`@theme`), palette, animations, utilities.
- `src/components/ui/index.jsx` — design-system primitives (single barrel export).
- `src/components/layout/` — shared shells/navbars.
- `src/lib/api.js` — fetch wrapper + session helpers.
- `src/pages/` — route pages.

## Data note
Backend statuses: `Received · Pending · Approved · Dispatched · Backtracked`. Desks: Reception, Verification Desk, Ward Chair Section, Tax Office Desk, Administrative Archives, Review Panel Office. Seed logins: `officer@ward.gov.np/officer123`, `admin@ward.gov.np/admin123`.

---

# TODO

## Completed
- Full codebase audit.

## In Progress
- Design system foundation (palette, tokens, primitives).

## Remaining
- Fix broken imports: LoginPage (`Link`), AdminDashboard (`Modal`,`Input`,`Select`).
- New color system: Deep Navy primary, Slate secondary, Emerald accent + status colors.
- Expand UI kit: Skeleton, Spinner, EmptyState, Toast, StatCard, Timeline, SectionLabel, Reveal, useCountUp.
- Shared authenticated navbar/layout to unify page headers.
- Landing page (hero, stats, features, how-it-works, workflows, testimonials, FAQ, footer).
- Apply new system across all pages; loading/empty/error states; responsiveness; a11y.

## Notes
- User wants Gov-tech feel (Stripe/Linear/Gov.uk), no neon, no childish gradients.
- Work autonomously, minimal prose, code over explanation.
