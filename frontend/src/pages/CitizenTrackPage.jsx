import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Container, Card, Button, Input, Icons, Skeleton, SectionLabel,
  Timeline, TimelineItem, Modal, Spinner, Reveal,
} from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';
import { timeAgo } from '../lib/time';

// The QR tag on a file receipt encodes a JSON payload ({ uid, ward/office, ts }).
// The public track endpoint accepts a file UID as well as a tracking ID, so a
// scanned payload just needs its uid extracted; plain text scans pass through.
function parseScannedCode(rawText) {
  if (!rawText) return '';
  const trimmed = rawText.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.uid) return String(parsed.uid).trim();
  } catch {
    // Not JSON — treat as a raw tracking ID / file UID
  }
  return trimmed;
}

// The citizen-facing rail groups the nine backend statuses into four stages.
//
// Stage 0 is intentionally labelled "Registered" (not "Received") because:
//   - "Registered" maps cleanly to the *first* MovementHistory entry (the
//     initial registration scan at reception). It is a one-shot event.
//   - "Received" reads like "the file has just arrived somewhere again",
//     which is misleading when the stepper highlights stage 0 during a
//     backtrack or a re-arrival — the file isn't being re-registered.
// The MovementHistory timeline and the desk chip strip below the rail
// surface the per-desk reality; the rail stays high-level and stable.
const STEPS = [
  { id: 'registered', label: 'Registered', hint: 'Filed at reception' },
  { id: 'processing', label: 'Processing', hint: 'Department review' },
  { id: 'decision', label: 'Decision', hint: 'Authorized outcome' },
  { id: 'dispatched', label: 'Dispatched', hint: 'Ready for collection' },
];
// Decision: 'In Transit' maps to stage 1 (Processing).
//
// At the moment forwardFile/backtrackFile writes IN_TRANSIT, the file has
// been scanned off the origin desk but not yet received at the destination —
// so it's logically past "Registered" and inside the office's internal
// handling. Mapping it to Processing here keeps the stepper stable across
// forward/backtrack directions (a backtrack to Reception would otherwise
// flicker the rail back to stage 0). The status banner carries the explicit
// "In Transit" badge so the intermediate state stays visible to citizens,
// and the "Currently handled by" tile routes through getEffectiveLocation()
// so it shows the destination desk — matching the Movement History copy.
const STEP_INDEX = {
  Received: 0,
  Pending: 1,
  'Under Review': 1,
  'In Transit': 1,
  Backtracked: 1,
  Returned: 1,
  Approved: 2,
  Verified: 2,
  Rejected: 2,
  Dispatched: 3,
};
const CLOSED_STATUSES = ['Dispatched', 'Approved', 'Rejected'];
const CORRECTION_STATUSES = ['Backtracked', 'Returned'];

// Human-readable ward names. Codes without a mapping fall back to "Ward <code>".
const WARD_NAMES = {
  W01: 'Kathmandu Metropolitan — Ward 1',
  W02: 'Kathmandu Metropolitan — Ward 2',
  W03: 'Kathmandu Metropolitan — Ward 3',
  W04: 'Kathmandu Metropolitan — Ward 4',
};

// Typical duration per stage — used in the stage-by-stage row below the ETA
// bar so citizens can see what each phase usually takes. These are realistic
// ranges for a government file workflow; the current stage is highlighted.
const STAGE_TYPICAL_DAYS = {
  registered: { label: 'Registered', typical: '<1 day', hint: 'Filed at reception' },
  processing: { label: 'Processing', typical: '2-3 days', hint: 'Department review' },
  decision: { label: 'Decision', typical: '1-2 days', hint: 'Authorized outcome' },
  dispatched: { label: 'Dispatched', typical: '<1 day', hint: 'Ready for collection' },
};

const STATUS_COPY = {
  Received: {
    title: 'Your file has been received.',
    summary: 'The office has registered your file and it is waiting for the next department action.',
    citizenAction: 'No action is required from you right now.',
    badge: 'Received',
  },
  Pending: {
    title: 'Your file is being reviewed.',
    summary: 'The responsible department is checking the submitted information and documents.',
    citizenAction: 'No action is required from you right now.',
    badge: 'In Review',
  },
  'Under Review': {
    title: 'Your file is being reviewed.',
    summary: 'The responsible department is checking the submitted information and documents.',
    citizenAction: 'No action is required from you right now.',
    badge: 'In Review',
  },
  Approved: {
    title: 'Your file has been approved.',
    summary: 'The required review has been completed successfully.',
    citizenAction: 'No action is required unless the office asks you to collect the document.',
    badge: 'Approved',
  },
  Verified: {
    title: 'Your file has been verified.',
    summary: 'The required verification has been completed successfully.',
    citizenAction: 'No action is required unless the office asks you to collect the document.',
    badge: 'Verified',
  },
  Dispatched: {
    title: 'Your file is ready for collection.',
    summary: 'The office process is complete and the file has been dispatched.',
    citizenAction: 'Visit the office with your receipt if collection is required.',
    badge: 'Dispatched',
  },
  Backtracked: {
    title: 'Your file needs a correction.',
    summary: 'The office returned the file because something needs to be corrected before it can continue.',
    citizenAction: 'Please check the latest reason below and contact the current desk if anything is unclear.',
    badge: 'Needs Correction',
  },
  Returned: {
    title: 'Your file needs a correction.',
    summary: 'The office returned the file because something needs to be corrected before it can continue.',
    citizenAction: 'Please check the latest reason below and contact the current desk if anything is unclear.',
    badge: 'Needs Correction',
  },
  Rejected: {
    title: 'Your file was not approved.',
    summary: 'The office reviewed the file and could not approve it in its current form.',
    citizenAction: 'Please contact the office with your receipt for the reason and next options.',
    badge: 'Not Approved',
  },
  // Defensive entry: 'Document Verified' is normally an audit action logged
  // to MovementHistory (actionType: 'Document Verified') rather than a value
  // for currentStatus — but if a future transition does surface it as the
  // headline status, the banner / pill should still render citizen-friendly
  // copy instead of falling through to the literal string.
  'Document Verified': {
    title: 'Documents verified.',
    summary:
      'All required physical documents have been verified by the office.',
    citizenAction: 'No action is required from you right now.',
    badge: 'Verified',
  },
};

const STATUS_TONE = {
  Received: 'primary',
  Pending: 'amber',
  'Under Review': 'amber',
  Approved: 'emerald',
  Verified: 'emerald',
  Dispatched: 'emerald',
  Backtracked: 'red',
  Returned: 'red',
  Rejected: 'red',
};

function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border glass">
      <Container className="flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button as={Link} to="/login" variant="outline" size="sm">
            <Icons.Lock className="h-3.5 w-3.5" /> Officer sign in
          </Button>
        </div>
      </Container>
    </header>
  );
}

function getStatusCopy(status) {
  return STATUS_COPY[status] || STATUS_COPY.Pending;
}

function getLatestReason(timeline = []) {
  const latest = [...timeline].reverse().find((item) => item.message);
  return latest ? latest.message : null;
}

function getExpectedUpdate(fileDetails, aiEstimate) {
  if (CLOSED_STATUSES.includes(fileDetails.currentStatus)) return 'Completed';
  if (CORRECTION_STATUSES.includes(fileDetails.currentStatus)) return 'After the requested correction is resolved';
  if (aiEstimate?.estimatedMinutesRemaining && aiEstimate.estimatedMinutesRemaining > 0) {
    const label = formatMinutes(aiEstimate.estimatedMinutesRemaining);
    if (label) return `About ${label}`;
  }
  return 'When the current desk moves the file';
}

// Single source of truth for the desk the file is logically at right now.
// During IN_TRANSIT the file's `currentLocation` still points at the origin
// desk (only the matching receive scan updates it), so every display section
// MUST route through this helper instead of reading `currentLocation` directly.
// Otherwise the status banner, stepper, File Journey, and "Currently handled
// by" tile can drift apart — the bug we are explicitly closing.
function getEffectiveLocation(fileDetails) {
  if (!fileDetails) return '';
  if (fileDetails.currentStatus === 'In Transit') {
    return fileDetails.targetLocation || fileDetails.currentLocation;
  }
  return fileDetails.currentLocation;
}

function formatMinutes(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return null;
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  const days = hours / 24;
  return `${days.toFixed(1)} day${days >= 2 ? 's' : ''}`;
}

// Animated 4-stage stepper. Connector line fills with the active tone up to
// the current stage; the active circle gets a pulsing ring to communicate
// "happening right now". Correction states use a calmer static warning
// treatment instead of pulsing.
function ProgressRail({ file }) {
  const status = file.currentStatus;
  const activeIndex = STEP_INDEX[status] ?? 0;
  const isCorrection = CORRECTION_STATUSES.includes(status);
  const isRejected = status === 'Rejected';
  const isClosed = CLOSED_STATUSES.includes(status);
  const segments = STEPS.length - 1;
  // Each segment fills when the file has reached that stage.
  const filledSegments = isClosed ? segments : activeIndex;
  const fillPct = segments > 0 ? (filledSegments / segments) * 100 : 0;

  return (
    <div className="relative">
      <div className="absolute left-4 right-4 top-4 h-0.5 bg-border" aria-hidden="true" />
      <div
        className={`absolute left-4 top-4 h-0.5 transition-all duration-700 ${
          isCorrection || isRejected ? 'bg-red-400' : 'bg-primary'
        }`}
        style={{ width: `calc((100% - 2rem) * ${fillPct / 100})` }}
        aria-hidden="true"
      />
      <ol className="relative grid grid-cols-4 gap-2">
        {STEPS.map((step, idx) => {
          const isDone = idx < activeIndex || (idx === activeIndex && isClosed);
          const isActive = idx === activeIndex && !isClosed;
          const isProblem = isActive && (isCorrection || isRejected);
          // Pulse only on the current stage for a non-problem file —
          // a pulsing warning can read as alarming rather than reassuring.
          const shouldPulse = isActive && !isProblem;
          const ringColor = isCorrection || isRejected ? 'bg-red-500' : 'bg-primary';
          return (
            <li key={step.id} className="flex flex-col items-center text-center">
              <span className="relative flex h-8 w-8 items-center justify-center">
                {shouldPulse && (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-0 rounded-full ${ringColor} animate-pulse-ring`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 ring-card transition-all duration-300 ${
                    isProblem
                      ? 'bg-red-500 text-white shadow-md'
                      : isDone
                        ? 'bg-emerald-500 text-white shadow-md'
                        : isActive
                          ? 'bg-primary text-primary-foreground shadow-md scale-110'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? (
                    <Icons.Check className="h-4 w-4" />
                  ) : isProblem ? (
                    <Icons.AlertCircle className="h-4 w-4" />
                  ) : (
                    idx + 1
                  )}
                </span>
              </span>
              <p
                className={`mt-2.5 text-xs font-semibold ${
                  isActive || isDone ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {isDone
                  ? 'Completed'
                  : isProblem
                    ? isRejected
                      ? 'Not approved'
                      : 'Needs correction'
                    : isActive
                      ? 'In progress'
                      : 'Upcoming'}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Compact chip strip showing every unique desk the file has physically
// touched, derived from MovementHistory. Complements the 4-stage ProgressRail
// (high-level) with the granular "where has my file been?" view that used to
// live only in the File Journey card.
//
// Why a separate strip instead of just expanding ProgressRail: the rail is
// deliberately a fixed 4-step abstraction (Registered → Processing → Decision
// → Dispatched). Adding a new chip per desk-hop keeps the rail stable while
// still giving the citizen a clear picture of every movement. The chips use
// the same dashed-amber "Heading to" treatment as the JourneyPath during
// IN_TRANSIT so the two views can never disagree.
//
// Privacy: desk/role strings only — no officer names.
function DeskChipStrip({ file }) {
  const timeline = Array.isArray(file?.timeline) ? file.timeline : [];
  const effectiveDesk = getEffectiveLocation(file);
  const isInTransit = file?.currentStatus === 'In Transit';
  const actualDesk = file?.currentLocation;

  // Build ordered unique-desk list from MovementHistory. Each entry becomes
  // a chip; the most recent distinct location gets the "Latest" badge.
  const seen = new Set();
  const desks = [];
  for (const entry of timeline) {
    const loc = entry?.location;
    if (loc && !seen.has(loc)) {
      seen.add(loc);
      desks.push({ name: loc, fromTimeline: true });
    }
  }
  // Anchor on the effective desk so the strip always ends on where the file
  // is logically at — matches the banner, the "Currently handled by" tile,
  // and File Journey.
  if (effectiveDesk && !seen.has(effectiveDesk)) {
    desks.push({ name: effectiveDesk, fromTimeline: false });
  }

  // Empty state — no timeline entries yet (defensive; shouldn't happen in
  // practice because registration writes a MovementHistory row).
  if (desks.length === 0) {
    return null;
  }

  const isSingleDesk = desks.length <= 1;
  // Find the index of the latest arrival (current desk, not the pending one).
  const currentIdx = actualDesk ? desks.findIndex((d) => d.name === actualDesk) : desks.length - 1;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icons.Route className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Desks visited
        </p>
      </div>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {desks.map((d, idx) => {
          const isCurrent = idx === currentIdx && idx === desks.length - 1 && !isInTransit;
          const isPendingDestination = isInTransit
            && idx === desks.length - 1
            && d.name !== actualDesk;
          const isEarlier = idx < currentIdx;
          return (
            <li key={`${d.name}-${idx}`} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isPendingDestination
                    ? 'border-dashed border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : isCurrent
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : isEarlier
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                        : 'border-border bg-muted/30 text-muted-foreground'
                }`}
              >
                <Icons.Building className="h-3 w-3 shrink-0" />
                {d.name}
                {isCurrent && !isSingleDesk && (
                  <span className="ml-0.5 rounded-full bg-primary/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                    Now
                  </span>
                )}
                {isPendingDestination && (
                  <span className="ml-0.5 rounded-full bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Heading to
                  </span>
                )}
                {isEarlier && (
                  <Icons.Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
              </span>
              {idx < desks.length - 1 && (
                <Icons.ArrowRight className="h-3 w-3 text-muted-foreground/60" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Animated header pill — shows status + a pulsing dot for live feel.
function LiveStatusPill({ file, isUpdating }) {
  const status = file.currentStatus;
  const tone = STATUS_TONE[status] || 'primary';

  const toneClasses = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  }[tone];
  const dotColor = {
    primary: 'bg-primary',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
    red: 'bg-red-500',
  }[tone];

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider ${toneClasses}`}
    >
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      {STATUS_COPY[status]?.badge || status}
      {isUpdating && <span className="ml-1 text-[10px] font-medium opacity-70">· refreshing</span>}
    </div>
  );
}

// Ticks every second so the "Next refresh" indicator stays believable when
// auto-refresh is on. Pure DOM — doesn't trigger any fetches.
function CountdownTimer({ enabled, intervalMs, onTick }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, Math.round(intervalMs / 1000)));

  useEffect(() => {
    if (!enabled) return undefined;
    setSecondsLeft(Math.max(1, Math.round(intervalMs / 1000)));
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onTick?.();
          return Math.max(1, Math.round(intervalMs / 1000));
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [enabled, intervalMs, onTick]);

  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
      <Icons.Clock className="h-3.5 w-3.5" />
      Next refresh in {secondsLeft}s
    </span>
  );
}

// Day-based ETA bar — "Day X of ~Y" with a proportional fill.
//
// The AI estimate endpoint only returns a *remaining* minutes estimate, not a
// total expected duration. We derive the total locally from the file's
// registeredAt + the AI's remaining estimate. This is mathematically
// equivalent (elapsed + remaining = total) and is the only way to draw a
// "day X of Y" bar without changing what the backend returns.
//
// Honest-fallback rules (per the design spec):
//   - If aiEstimate is missing OR the remaining estimate is not a positive
//     finite number, render a neutral fallback rather than a fabricated bar.
//   - If elapsed exceeds the predicted total, show "running longer than
//     expected" with a distinct treatment instead of silently capping at 100%.
//   - predictionSource adjusts the wording: real-data estimates can name a
//     specific day count; synthetic / heuristic ones use softer phrasing
//     (a range or "around") rather than a precise number.
function TimeProgressBar({ file, aiEstimate }) {
  const registeredAt = file?.registeredAt || file?.createdAt;
  const registeredDate = registeredAt ? new Date(registeredAt) : null;
  const nowMs = Date.now();

  const remainingMinutes = aiEstimate?.estimatedMinutesRemaining;
  const confidence = aiEstimate?.confidence || null;
  const predictionSource = aiEstimate?.predictionSource || null;
  const hasEstimate =
    Number.isFinite(remainingMinutes) && remainingMinutes > 0 && registeredDate;

  // Map current status to the active stage index (matches ProgressRail/STEPS).
  const activeStageId = STEPS[STEP_INDEX[file?.currentStatus] ?? 0]?.id;

  // Fallback path: no usable estimate. Don't fabricate a bar.
  if (!hasEstimate) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <Icons.Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estimated timeline
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">Estimate not available yet</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            We need a few more similar cases in your ward before we can show a typical timeline.
          </p>
        </div>
        <StageTypicalRow activeStageId={activeStageId} />
      </div>
    );
  }

  const elapsedMs = Math.max(0, nowMs - registeredDate.getTime());
  const remainingMs = Math.max(0, remainingMinutes * 60 * 1000);
  const totalMs = elapsedMs + remainingMs;

  // Day counts: floor elapsed so "Day 0" is possible only on the first
  // partial day. Round total up to the next whole day for an honest "~N days".
  const elapsedDaysFloat = elapsedMs / (24 * 60 * 60 * 1000);
  const elapsedDays = Math.floor(elapsedDaysFloat);
  const totalDaysFloat = totalMs / (24 * 60 * 60 * 1000);
  const totalDaysRaw = Math.max(1, Math.round(totalDaysFloat));
  const totalDaysSoft = Math.max(2, Math.ceil(totalDaysFloat)); // softer round for synthetic

  const isOverdue = elapsedMs > totalMs;
  // Fill cap: cap fill at 100% visually but DON'T lie about the number —
  // we still display elapsedDaysRaw even if it exceeds totalDaysRaw.
  const fillPct = isOverdue
    ? 100
    : Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

  // Prediction-source classification. The Python AI service sets these;
  // when it's unreachable, the Node fallback omits them entirely.
  const isSynthetic =
    !predictionSource ||
    predictionSource === 'trained_model_synthetic' ||
    predictionSource === 'heuristic_fallback';

  // Day-count copy varies with confidence in the model. Real data → exact;
  // synthetic/heuristic → a softer "around" phrasing with a small range.
  const dayLabel = isSynthetic
    ? `around ${totalDaysSoft} days`
    : `~${totalDaysRaw} day${totalDaysRaw === 1 ? '' : 's'}`;

  const attribution = isSynthetic
    ? `Estimated from typical desk cycle times. We refine this as more files complete at your ward.`
    : `Based on similar cases processed at your ward.`;

  // Reframe the AI confidence into a ward-comparison hint so citizens
  // understand what it means in plain language.
  const wardComparison =
    confidence === 'high'
      ? 'Faster than most similar files at this ward.'
      : confidence === 'medium'
        ? 'About average for similar files at this ward.'
        : confidence === 'low'
          ? 'Fewer similar cases at this ward — estimate is approximate.'
          : null;

  const fillColor = isOverdue
    ? 'bg-amber-500'
    : isSynthetic
      ? 'bg-primary/70'
      : 'bg-primary';

  const containerTone = isOverdue
    ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-border bg-muted/20';

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-4 ${containerTone}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icons.CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estimated timeline
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isOverdue && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                Running longer than expected
              </span>
            )}
            <span className="tabular-nums text-sm font-bold text-foreground">
              Day {elapsedDays} of {dayLabel}
            </span>
          </div>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${fillColor}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {isOverdue
            ? `Your file has been in process for ${elapsedDays} day${elapsedDays === 1 ? '' : 's'}; the typical estimate was ${dayLabel}. The office is still working on it.`
            : wardComparison
              ? `${attribution} ${wardComparison}`
              : attribution}
        </p>
      </div>
      <StageTypicalRow activeStageId={activeStageId} />
    </div>
  );
}

// Stage-by-stage typical durations — a small 4-column row beneath the ETA bar
// that shows what each stage usually takes. Current stage is highlighted. If
// the file is closed, the last stage is treated as the active one.
function StageTypicalRow({ activeStageId }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Object.entries(STAGE_TYPICAL_DAYS).map(([id, info]) => {
        const isActive = id === activeStageId;
        return (
          <div
            key={id}
            className={`rounded-xl border p-3 transition-colors ${
              isActive
                ? 'border-primary/40 bg-primary/5'
                : 'border-border bg-muted/10'
            }`}
          >
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {info.label}
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
              {info.typical}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              {info.hint}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function NotificationDot({ icon, label, masked, active, count }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <span className="font-semibold text-foreground">{label}: </span>
        <span className="text-muted-foreground">
          {active ? (masked || 'Enabled') : 'Not enabled'}
          {Number.isFinite(count) && count > 0 && ` (${count} updates)`}
        </span>
      </div>
    </div>
  );
}

// Document checklist mini — shows AI verification status of each required doc.
function DocumentChecklistMini({ fileDetails }) {
  const verifications = Array.isArray(fileDetails.documentVerifications) ? fileDetails.documentVerifications : [];
  const required = Array.isArray(fileDetails.requiredDocuments) ? fileDetails.requiredDocuments : [];

  if (verifications.length === 0 && required.length === 0) return null;

  const verifiedCount = verifications.filter((dv) => dv.status === 'verified').length;
  const totalCount = verifications.length || required.length;
  const pct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

  const rows =
    verifications.length > 0
      ? verifications
      : required.map((label, idx) => ({ documentLabel: label, status: 'pending', key: idx }));

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icons.FileText className="h-4.5 w-4.5 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Document checklist
          </h4>
        </div>
        {verifications.length > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              pct === 100
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }`}
          >
            {verifiedCount}/{verifications.length} verified
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {rows.map((item, idx) => {
          const isVerified = item.status === 'verified';
          const isMissing = item.status === 'missing' || item.status === 'needs-reupload';
          const label = item.documentLabel || item.label;
          return (
            <li
              key={item.id || `${label}-${idx}`}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                isVerified
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : isMissing
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-border bg-muted/20'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isVerified
                    ? 'bg-emerald-500 text-white'
                    : isMissing
                      ? 'bg-amber-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isVerified ? (
                  <Icons.Check className="h-3.5 w-3.5" />
                ) : isMissing ? (
                  <Icons.AlertCircle className="h-3.5 w-3.5" />
                ) : (
                  <Icons.Clock className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
              <span
                className={`text-xs font-semibold ${
                  isVerified
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isMissing
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-muted-foreground'
                }`}
              >
                {isVerified ? 'Verified' : isMissing ? 'Needs re-upload' : 'Pending'}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// Main hero status card.
function StatusCard({
  fileDetails,
  aiEstimate,
  autoRefresh,
  onAutoRefreshChange,
  onManualRefresh,
  isUpdating,
  lastFetchedAt,
}) {
  const missingDocs =
    Array.isArray(fileDetails.documentVerifications) && fileDetails.documentVerifications.length > 0
      ? fileDetails.documentVerifications
          .filter((dv) => dv.status !== 'verified')
          .map((dv) => dv.documentLabel)
      : fileDetails.missingDocuments ||
        fileDetails.documentVerification?.missingKeywords ||
        fileDetails.documentVerification?.missingDocuments ||
        [];
  const hasMissingDocs =
    missingDocs.length > 0 || fileDetails.verificationStatus === 'missing-documents';

  const statusCopy = getStatusCopy(fileDetails.currentStatus);
  const latestReason = getLatestReason(fileDetails.timeline);
  const expectedUpdate = getExpectedUpdate(fileDetails, aiEstimate);
  const needsAction = CORRECTION_STATUSES.includes(fileDetails.currentStatus) || hasMissingDocs;
  const isClosed = fileDetails.currentStatus === 'Dispatched';

  const qualityIssue =
    Array.isArray(fileDetails.documentVerifications) && fileDetails.documentVerifications.length > 0
      ? fileDetails.documentVerifications.find(
          (dv) =>
            dv.imageQualityIssue &&
            (dv.imageQualityIssue.isBlurry ||
              dv.imageQualityIssue.isDark ||
              dv.imageQualityIssue.noTextDetected)
        )?.imageQualityIssue
      : null;
  const showQualityNudge =
    !!qualityIssue &&
    !hasMissingDocs &&
    ['Received', 'Pending', 'Under Review', 'Backtracked', 'Returned'].includes(
      fileDetails.currentStatus
    );

  const cardTitle = hasMissingDocs ? 'Action Required: Remaining Document(s) Needed' : statusCopy.title;
  const cardSummary = hasMissingDocs
    ? `The office registered your file at ${fileDetails.currentLocation || 'Reception'}, but required document(s) are missing from the checklist. Please submit them to proceed.`
    : statusCopy.summary;
  const citizenActionText = hasMissingDocs
    ? `Please bring or submit the missing document(s) listed below to ${fileDetails.currentLocation || 'Reception'}.`
    : statusCopy.citizenAction;

  return (
    <Card className="overflow-hidden p-0">
      <div
        className={`relative border-b border-border p-6 md:p-8 ${
          needsAction
            ? 'bg-gradient-to-br from-amber-50 via-amber-50/30 to-transparent dark:from-amber-950/30 dark:via-amber-950/10'
            : 'bg-gradient-to-br from-primary/[0.04] via-primary/[0.02] to-transparent'
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <span className="font-mono text-xs text-muted-foreground">
              {fileDetails.trackingId} · {fileDetails.documentType} · Ward {fileDetails.wardCode}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {cardTitle}
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              {cardSummary}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <LiveStatusPill file={fileDetails} isUpdating={isUpdating} />
            {lastFetchedAt && (
              <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isUpdating ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
                Updated {timeAgo(lastFetchedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-7 md:px-8 md:py-8">
        <ProgressRail file={fileDetails} />
        <DeskChipStrip file={fileDetails} />

        {!isClosed && (
          <TimeProgressBar file={fileDetails} aiEstimate={aiEstimate} />
        )}

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icons.Building className="h-4 w-4" /> Current ward
            </dt>
            <dd className="mt-2 text-sm font-bold text-foreground">
              {fileDetails.wardCode
                ? WARD_NAMES[fileDetails.wardCode] || `Ward ${fileDetails.wardCode}`
                : 'Not recorded'}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icons.User className="h-4 w-4" /> Currently handled by
            </dt>
            <dd className="mt-2 text-sm font-bold text-foreground">
              {(() => {
                const desk = getEffectiveLocation(fileDetails);
                return desk ? `${desk} desk` : 'Not recorded';
              })()}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icons.Clock className="h-4 w-4" /> Next update
            </dt>
            <dd className="mt-2 text-sm font-bold text-foreground">{expectedUpdate}</dd>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              needsAction
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-emerald-500/20 bg-emerald-500/5'
            }`}
          >
            <dt
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${
                needsAction
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {needsAction ? (
                <Icons.AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Icons.CheckCircle className="h-4 w-4 shrink-0" />
              )}
              Your action
            </dt>
            <dd className="mt-2 text-sm font-medium text-foreground">{citizenActionText}</dd>
          </div>
        </dl>

        {showQualityNudge && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-950 dark:text-sky-100">
            <div className="flex items-start gap-2.5">
              <Icons.Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
              <div>
                <h4 className="font-semibold">Help us speed up your file</h4>
                <p className="mt-1 text-xs leading-relaxed opacity-90">
                  One or more uploaded document scans were unclear. If you can bring a clearer photo or the original document to {fileDetails.currentLocation || 'the office'}, we can process your file faster.
                </p>
              </div>
            </div>
          </div>
        )}

        {hasMissingDocs && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              <Icons.AlertCircle className="h-4.5 w-4.5 shrink-0 text-amber-600" />
              Remaining Required Document(s) Needed ({missingDocs.length})
            </div>
            <ul className="mt-2.5 space-y-1.5 pl-1">
              {missingDocs.map((doc) => (
                <li
                  key={doc}
                  className="flex items-center gap-2 text-xs font-semibold text-amber-950 dark:text-amber-100"
                >
                  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    !
                  </span>
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <NotificationDot
              icon="📧"
              label="Email"
              masked={fileDetails.citizenEmailMasked}
              active={fileDetails.emailNotificationsActive}
            />
            <NotificationDot
              icon="📱"
              label="SMS"
              masked={fileDetails.citizenPhoneMasked || 'registered phone'}
              active
              count={fileDetails.smsNotificationsSent}
            />
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-600">
            ✓ Notifications active
          </span>
        </div>

        {CORRECTION_STATUSES.includes(fileDetails.currentStatus) && latestReason && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              Latest correction reason
            </p>
            <p className="mt-1 text-sm font-medium text-red-700/90 dark:text-red-300/90">{latestReason}</p>
          </div>
        )}

        {!isClosed && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => onAutoRefreshChange(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-muted text-primary accent-primary focus:ring-primary/20"
              />
              Auto-refresh every 30 seconds
            </label>
            <div className="flex items-center gap-3">
              <CountdownTimer
                enabled={autoRefresh}
                intervalMs={30000}
                onTick={onManualRefresh}
              />
              <Button variant="ghost" size="sm" onClick={onManualRefresh} disabled={isUpdating}>
                <Icons.RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                Refresh now
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Movement history card — highlights the latest event with a small "Latest" pill.
function TimelineCard({ fileDetails }) {
  const timeline = fileDetails.timeline || [];
  const latestTimestamp = timeline.length > 0 ? timeline[timeline.length - 1].timestamp : null;

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icons.Layers className="h-4.5 w-4.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Movement history
          </h4>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {timeline.length} event{timeline.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Registered{' '}
          {new Date(fileDetails.registeredAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      {timeline.length > 0 ? (
        <Timeline>
          {timeline.map((item, idx) => {
            const isLatest = item.timestamp === latestTimestamp;
            const tone =
              CORRECTION_STATUSES.includes(item.status) || item.status === 'Rejected'
                ? 'red'
                : ['Approved', 'Verified', 'Dispatched'].includes(item.status)
                  ? 'emerald'
                  : 'primary';
            return (
              <TimelineItem
                key={`${item.timestamp}-${idx}`}
                title={item.status}
                meta={new Date(item.timestamp).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                tone={tone}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground/70">{item.location}</p>
                  {/* "Verified at desk" badge means the file was *verified*
                      (actionType Verified / Document Verified) — NOT just
                      that it was QR-scanned. A plain receive event scans
                      via QR but is not yet verified, so showing the badge
                      there conflated scanning with verification. */}
                  {(item.status === 'Verified' || item.status === 'Document Verified') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <Icons.CheckCircle className="h-3 w-3" /> Verified at desk
                    </span>
                  )}
                  {isLatest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      Latest
                    </span>
                  )}
                </div>
                {item.message && (
                  <p className="mt-1.5 rounded-lg border border-border/50 bg-muted/40 p-2.5 text-xs">
                    {item.message}
                  </p>
                )}
              </TimelineItem>
            );
          })}
        </Timeline>
      ) : (
        <p className="py-8 text-center text-xs italic text-muted-foreground">
          No movement recorded yet.
        </p>
      )}
    </Card>
  );
}

// Empty-state hero shown when no tracking ID has been submitted yet.
function EmptySearchHero({ previousSearches, onQuickTrack }) {
  return (
    <div className="space-y-8 animate-fade-up">
      {previousSearches.length > 0 && (
        <Reveal>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent searches
              </h4>
              <span className="text-[11px] text-muted-foreground">Click to re-track</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousSearches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onQuickTrack(s.id)}
                  className="group inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md cursor-pointer"
                >
                  <Icons.Clock className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                  <span className="font-mono text-primary">{s.id}</span>
                  <span className="max-w-[150px] truncate font-normal text-muted-foreground">
                    ({s.title})
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={120}>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Icons.QrCode,
              t: 'Scan or type your ID',
              d: 'Scan the QR on your receipt with your camera, or type the ID starting with TG.',
            },
            {
              icon: Icons.Route,
              t: 'See live movement',
              d: 'Follow the file across desks without visiting repeatedly.',
            },
            {
              icon: Icons.Bell,
              t: 'Stay notified',
              d: 'Get SMS or email alerts at every step — or refresh on your own schedule.',
            },
          ].map((x) => (
            <div
              key={x.t}
              className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <x.icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">{x.t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

export default function CitizenTrackPage() {
  const { id: pathId } = useParams();
  const [searchParams] = useSearchParams();
  const urlId = pathId || searchParams.get('id') || searchParams.get('trackingId');

  const [trackingId, setTrackingId] = useState(urlId || '');
  const [fileDetails, setFileDetails] = useState(null);
  const [aiEstimate, setAiEstimate] = useState(null);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const lastStatusRef = useRef(null);

  const [previousSearches, setPreviousSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('tracegov_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [autoRefresh, setAutoRefresh] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerInitializing, setScannerInitializing] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const qrScannerRef = useRef(null);

  const saveSearchHistory = useCallback((id, title) => {
    setPreviousSearches((prev) => {
      const filtered = prev.filter((x) => x.id !== id);
      const updated = [{ id, title }, ...filtered].slice(0, 5);
      localStorage.setItem('tracegov_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const runTrack = useCallback(
    async (id, { silent = false } = {}) => {
      if (!id || !id.trim()) return;
      if (!silent) {
        setLoading(true);
        setError('');
        setErrorKind('');
        setAiEstimate(null);
        setSearched(true);
      } else {
        setIsUpdating(true);
      }
      try {
        const cleanId = id.trim().toUpperCase();
        const [trackData, estimateData] = await Promise.all([
          api.trackCitizen(cleanId),
          api.estimateCompletion(cleanId).catch(() => null),
        ]);
        setFileDetails(trackData);
        setAiEstimate(estimateData);
        setLastFetchedAt(new Date());
        saveSearchHistory(cleanId, trackData.title);
        setError('');
        setErrorKind('');
      } catch (err) {
        const msg = err.message || 'Tracking ID not found. Please check the ID and try again.';
        if (!silent) {
          setError(msg);
          setErrorKind(/not found/i.test(msg) ? 'not-found' : 'network');
          setFileDetails(null);
        }
      } finally {
        setLoading(false);
        setIsUpdating(false);
      }
    },
    [saveSearchHistory]
  );

  useEffect(() => {
    if (urlId) {
      setTrackingId(urlId);
      runTrack(urlId);
    }
  }, [urlId, runTrack]);

  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    await runTrack(trackingId);
  };

  const handleQuickTrack = (id) => {
    setTrackingId(id);
    runTrack(id);
  };

  const handleManualRefresh = useCallback(() => {
    if (fileDetails?.trackingId) {
      runTrack(fileDetails.trackingId, { silent: true });
    }
  }, [runTrack, fileDetails]);

  const stopCameraScanner = useCallback(() => {
    setIsScannerOpen(false);
    setScannerInitializing(false);
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          scanner.stop().catch(() => {});
        } else if (typeof scanner.clear === 'function') {
          scanner.clear().catch(() => {});
        }
      } catch {
        // Ignore html5-qrcode error
      }
    }
  }, []);

  const startCameraScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    setScannerInitializing(true);
    setTimeout(async () => {
      let Html5Qrcode;
      try {
        ({ Html5Qrcode } = await import('html5-qrcode'));
      } catch {
        setScannerInitializing(false);
        setScannerError(
          'Could not load the scanner. Please check your connection, or type the tracking ID instead.'
        );
        return;
      }
      const html5QrCode = new Html5Qrcode('citizen-qr-reader');
      qrScannerRef.current = html5QrCode;
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          stopCameraScanner();
          const id = parseScannedCode(decodedText);
          setTrackingId(id);
          runTrack(id);
        },
        () => {}
      )
        .then(() => setScannerInitializing(false))
        .catch(() => {
          setScannerInitializing(false);
          setScannerError(
            'Could not access the camera. Please allow camera permission in your browser, or type the tracking ID instead.'
          );
        });
    }, 300);
  };

  useEffect(
    () => () => {
      if (qrScannerRef.current) qrScannerRef.current.stop().catch(() => {});
    },
    []
  );

  useEffect(() => {
    if (!autoRefresh || !fileDetails || CLOSED_STATUSES.includes(fileDetails.currentStatus))
      return undefined;
    const interval = setInterval(() => {
      runTrack(fileDetails.trackingId, { silent: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fileDetails, runTrack]);

  useEffect(() => {
    if (!fileDetails) return;
    if (lastStatusRef.current && lastStatusRef.current !== fileDetails.currentStatus) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('File Status Update', {
          body: `Your file "${fileDetails.title}" changed to ${fileDetails.currentStatus} at ${fileDetails.currentLocation}.`,
        });
      }
    }
    lastStatusRef.current = fileDetails.currentStatus;
  }, [fileDetails]);

  const onAutoRefreshChange = (checked) => {
    setAutoRefresh(checked);
    if (checked && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="pb-24">
        <section className="border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
          <Container className="py-12 md:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>Citizen portal</SectionLabel>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                Track your government file
              </h1>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">
                Enter the tracking ID from your receipt to see where your file is, who has it, and
                what happens next.
              </p>
            </div>

            <Reveal className="mx-auto mt-8 max-w-xl">
              <Card className="shadow-xl">
                <form onSubmit={handleTrackSubmit} className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="trackingId"
                    placeholder="e.g. TGTRACKA82"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    mono
                    required
                    disabled={loading}
                    icon={<Icons.Search className="h-4 w-4" />}
                    className="flex-1"
                    aria-label="Tracking ID"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    loading={loading}
                    disabled={loading}
                    className="shrink-0 sm:w-auto"
                  >
                    {loading ? (
                      'Searching…'
                    ) : (
                      <>
                        Track file <Icons.ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    or
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={startCameraScanner}
                  disabled={loading}
                >
                  <Icons.QrCode className="h-4 w-4" /> Scan the QR code on your receipt
                </Button>
              </Card>
            </Reveal>
          </Container>
        </section>

        <Container className="mt-8 max-w-5xl">
          {loading && (
            <div className="space-y-6">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-32" />
              <Skeleton className="h-72" />
            </div>
          )}

          {!loading && error && (
            <Reveal>
              <Card className="border-red-500/30 bg-red-500/[0.04]">
                <div className="flex flex-col items-center text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-600">
                    <Icons.Search className="h-7 w-7" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {errorKind === 'not-found'
                      ? 'No file found with that ID'
                      : 'Could not load tracking data'}
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs text-muted-foreground md:text-sm">
                    {errorKind === 'not-found'
                      ? 'Double-check the tracking ID printed on your receipt. It usually starts with the letters TG.'
                      : error}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setError('');
                        setErrorKind('');
                        setSearched(false);
                      }}
                    >
                      <Icons.RefreshCw className="h-3.5 w-3.5" /> Try another ID
                    </Button>
                  </div>
                </div>
              </Card>
            </Reveal>
          )}

          {!loading && !error && !searched && (
            <EmptySearchHero
              previousSearches={previousSearches}
              onQuickTrack={handleQuickTrack}
            />
          )}

          {!loading && fileDetails && (
            <div className="space-y-6 animate-fade-up">
              <Reveal>
                <StatusCard
                  fileDetails={fileDetails}
                  aiEstimate={aiEstimate}
                  autoRefresh={autoRefresh}
                  onAutoRefreshChange={onAutoRefreshChange}
                  onManualRefresh={handleManualRefresh}
                  isUpdating={isUpdating}
                  lastFetchedAt={lastFetchedAt}
                />
              </Reveal>

              <Reveal delay={180}>
                <DocumentChecklistMini fileDetails={fileDetails} />
              </Reveal>

              <Reveal delay={260}>
                <TimelineCard fileDetails={fileDetails} />
              </Reveal>
            </div>
          )}
        </Container>
      </main>

      <Modal
        isOpen={isScannerOpen}
        onClose={stopCameraScanner}
        title="Scan your QR code"
        description="Point your camera at the QR code printed on your file receipt."
      >
        <div className="space-y-3">
          <div
            id="citizen-qr-reader"
            className="overflow-hidden rounded-xl border border-border bg-black [&_video]:!w-full"
          />
          {scannerInitializing && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Starting camera…
            </div>
          )}
          {scannerError && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-medium text-amber-600">
              {scannerError}
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={stopCameraScanner}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
