import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Container, Card, Button, Input, Badge, Icons, Skeleton, EmptyState, SectionLabel,
  Timeline, TimelineItem, Modal, Spinner,
} from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';

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
const STEPS = ['Received', 'In processing', 'Decision', 'Dispatched'];
const STEP_INDEX = {
  Received: 0,
  Pending: 1,
  'Under Review': 1,
  Backtracked: 1,
  Returned: 1,
  Approved: 2,
  Verified: 2,
  Rejected: 2,
  Dispatched: 3,
};
const CORRECTION_STATUSES = ['Backtracked', 'Returned'];

const STATUS_COPY = {
  Received: {
    title: 'Your file has been received.',
    summary: 'The office has registered your file and it is waiting for the next department action.',
    citizenAction: 'No action is required from you right now.',
  },
  Pending: {
    title: 'Your file is being reviewed.',
    summary: 'The responsible department is checking the submitted information and documents.',
    citizenAction: 'No action is required from you right now.',
  },
  'Under Review': {
    title: 'Your file is being reviewed.',
    summary: 'The responsible department is checking the submitted information and documents.',
    citizenAction: 'No action is required from you right now.',
  },
  Approved: {
    title: 'Your file has been approved.',
    summary: 'The required review has been completed successfully.',
    citizenAction: 'No action is required unless the office asks you to collect the document.',
  },
  Verified: {
    title: 'Your file has been verified.',
    summary: 'The required verification has been completed successfully.',
    citizenAction: 'No action is required unless the office asks you to collect the document.',
  },
  Dispatched: {
    title: 'Your file is ready for collection.',
    summary: 'The office process is complete and the file has been dispatched.',
    citizenAction: 'Please visit the office with your receipt if collection is required.',
  },
  Backtracked: {
    title: 'Your file needs a correction.',
    summary: 'The office returned the file because something needs to be corrected before it can continue.',
    citizenAction: 'Please check the latest reason below and contact the current desk if anything is unclear.',
  },
  Returned: {
    title: 'Your file needs a correction.',
    summary: 'The office returned the file because something needs to be corrected before it can continue.',
    citizenAction: 'Please check the latest reason below and contact the current desk if anything is unclear.',
  },
  Rejected: {
    title: 'Your file was not approved.',
    summary: 'The office reviewed the file and could not approve it in its current form.',
    citizenAction: 'Please contact the office with your receipt for the reason and next options.',
  },
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
  if (!latest) return null;
  return latest.message;
}

function getExpectedUpdate(fileDetails, aiEstimate) {
  if (fileDetails.currentStatus === 'Dispatched') return 'Completed';
  if (CORRECTION_STATUSES.includes(fileDetails.currentStatus)) return 'After the requested correction is resolved';
  if (aiEstimate?.estimatedMinutesRemaining) return `About ${aiEstimate.estimatedMinutesRemaining} minutes`;
  return 'When the current desk moves the file';
}

function ProgressRail({ file }) {
  const status = file.currentStatus;
  const activeIndex = STEP_INDEX[status] ?? 0;
  const needsCorrection = CORRECTION_STATUSES.includes(status);
  const rejected = status === 'Rejected';

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {STEPS.map((step, idx) => {
        const isDone = idx < activeIndex || (idx === activeIndex && status === 'Dispatched');
        const isActive = idx === activeIndex && status !== 'Dispatched';
        const isProblem = isActive && (needsCorrection || rejected);
        return (
          <div key={step} className={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
            isProblem ? 'border-red-500/30 bg-red-500/5'
              : isDone ? 'border-emerald-500/30 bg-emerald-500/5'
              : isActive ? 'border-primary/30 bg-primary/5'
              : 'border-border bg-muted/20'
          }`}>
            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
              isProblem ? 'bg-red-500 text-white'
                : isDone ? 'bg-emerald-500 text-white'
                : isActive ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {isDone ? <Icons.Check className="h-4 w-4" /> : isProblem ? <Icons.AlertCircle className="h-4 w-4" /> : idx + 1}
            </div>
            <p className="mt-2.5 text-xs font-semibold text-foreground">{step}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isProblem ? (rejected ? 'Not approved' : 'Needs correction') : isDone ? 'Completed' : isActive ? 'In progress' : 'Upcoming'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Single answer card: status headline, progress rail, and the three facts a
// citizen actually needs — where the file is, when to expect progress, and
// whether they must do anything.
function StatusCard({ fileDetails, aiEstimate, autoRefresh, onAutoRefreshChange }) {
  const statusCopy = getStatusCopy(fileDetails.currentStatus);
  const latestReason = getLatestReason(fileDetails.timeline);
  const expectedUpdate = getExpectedUpdate(fileDetails, aiEstimate);
  const needsAction = CORRECTION_STATUSES.includes(fileDetails.currentStatus);
  const isClosed = fileDetails.currentStatus === 'Dispatched';

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-muted/30 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-muted-foreground">{fileDetails.trackingId} · {fileDetails.documentType} · Ward {fileDetails.wardCode}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{statusCopy.title}</h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">{statusCopy.summary}</p>
          </div>
          <Badge status={fileDetails.currentStatus} />
        </div>
      </div>

      <div className="p-6 md:p-8">
        <ProgressRail file={fileDetails} />

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icons.Building className="h-4 w-4" /> Current desk
            </dt>
            <dd className="mt-2 text-sm font-bold text-foreground">{fileDetails.currentLocation || 'Not recorded'}</dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Icons.Clock className="h-4 w-4" /> Next update
            </dt>
            <dd className="mt-2 text-sm font-bold text-foreground">{expectedUpdate}</dd>
          </div>
          <div className={`rounded-xl border p-4 ${needsAction ? 'border-red-500/20 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
            <dt className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${needsAction ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {needsAction ? <Icons.AlertCircle className="h-4 w-4" /> : <Icons.CheckCircle className="h-4 w-4" />} Your action
            </dt>
            <dd className="mt-2 text-sm font-medium text-foreground">{statusCopy.citizenAction}</dd>
          </div>
        </dl>

        {needsAction && latestReason && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Latest correction reason</p>
            <p className="mt-1 text-sm font-medium text-red-700/90 dark:text-red-300/90">{latestReason}</p>
          </div>
        )}

        {!isClosed && (
          <label className="mt-6 flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary/20 accent-primary"
            />
            Auto-refresh every 30 seconds and notify me of status changes
          </label>
        )}
      </div>
    </Card>
  );
}

export default function CitizenTrackPage() {
  const [trackingId, setTrackingId] = useState('');
  const [fileDetails, setFileDetails] = useState(null);
  const [aiEstimate, setAiEstimate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
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

  // QR scanner (html5-qrcode camera view inside a modal)
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

  const runTrack = useCallback(async (id) => {
    setLoading(true);
    setError('');
    setAiEstimate(null);
    setSearched(true);
    try {
      const cleanId = id.trim().toUpperCase();
      const [trackData, estimateData] = await Promise.all([
        api.trackCitizen(cleanId),
        api.estimateCompletion(cleanId).catch(() => null),
      ]);
      setFileDetails(trackData);
      setAiEstimate(estimateData);
      saveSearchHistory(cleanId, trackData.title);
    } catch (err) {
      setError(err.message || 'Tracking ID not found. Please check the ID and try again.');
      setFileDetails(null);
    } finally {
      setLoading(false);
    }
  }, [saveSearchHistory]);

  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    await runTrack(trackingId);
  };

  const handleQuickTrack = (id) => {
    setTrackingId(id);
    runTrack(id);
  };

  const stopCameraScanner = useCallback(() => {
    setIsScannerOpen(false);
    setScannerInitializing(false);
    if (qrScannerRef.current) {
      qrScannerRef.current.stop().then(() => { qrScannerRef.current = null; }).catch(() => {});
    }
  }, []);

  const startCameraScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    setScannerInitializing(true);
    // Wait for the modal (and its container div) to mount before attaching the
    // camera. html5-qrcode (~380 kB) is loaded on demand so citizens who type
    // their ID never download it.
    setTimeout(async () => {
      let Html5Qrcode;
      try {
        ({ Html5Qrcode } = await import('html5-qrcode'));
      } catch {
        setScannerInitializing(false);
        setScannerError('Could not load the scanner. Please check your connection, or type the tracking ID instead.');
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
      ).then(() => setScannerInitializing(false))
        .catch(() => {
          setScannerInitializing(false);
          setScannerError('Could not access the camera. Please allow camera permission in your browser, or type the tracking ID instead.');
        });
    }, 300);
  };

  // Stop the camera if the page unmounts while scanning
  useEffect(() => () => {
    if (qrScannerRef.current) qrScannerRef.current.stop().catch(() => {});
  }, []);

  useEffect(() => {
    if (!autoRefresh || !fileDetails || fileDetails.currentStatus === 'Dispatched') return undefined;
    const interval = setInterval(() => {
      runTrack(fileDetails.trackingId);
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

      <main className="pb-20">
        <section className="border-b border-border">
          <Container className="py-14 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>Citizen portal</SectionLabel>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Track your government file</h1>
              <p className="mt-4 text-lg text-muted-foreground">Enter the tracking ID from your receipt to see where your file is, who has it, and what happens next.</p>
            </div>

            <Card className="mx-auto mt-9 max-w-xl shadow-lg">
              <form onSubmit={handleTrackSubmit} className="flex flex-col gap-3 sm:flex-row">
                <Input id="trackingId" placeholder="e.g. TGTRACKA82" value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)} mono required disabled={loading}
                  className="flex-1" aria-label="Tracking ID" />
                <Button type="submit" variant="primary" size="md" className="shrink-0 sm:w-auto" loading={loading}>
                  {loading ? 'Searching...' : <>Track file <Icons.ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
              <div className="mt-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" size="md" className="mt-3 w-full" onClick={startCameraScanner} disabled={loading}>
                <Icons.QrCode className="h-4 w-4" /> Scan the QR code on your receipt
              </Button>
            </Card>
          </Container>
        </section>

        <Container className="mt-10 max-w-5xl">
          {loading && (
            <div className="space-y-6">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-56" />
            </div>
          )}

          {!loading && error && (
            <EmptyState
              icon={<Icons.Search className="h-6 w-6" />}
              title="No file found"
              description={error}
              action={<Button variant="outline" onClick={() => { setError(''); setSearched(false); }}>Try another ID</Button>}
            />
          )}

          {!loading && !error && !searched && (
            <div className="space-y-6 animate-fade-up">
              {previousSearches.length > 0 && (
                <Card>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent searches</h4>
                  <div className="flex flex-wrap gap-2">
                    {previousSearches.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleQuickTrack(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-muted hover:border-border-strong cursor-pointer"
                      >
                        <Icons.Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-primary">{s.id}</span>
                        <span className="max-w-[150px] truncate text-muted-foreground font-normal">({s.title})</span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: Icons.QrCode, t: 'Scan or type your ID', d: 'Scan the QR on your receipt with your camera, or type the ID starting with TG.' },
                  { icon: Icons.Route, t: 'See live movement', d: 'Follow the file across desks without visiting repeatedly.' },
                  { icon: Icons.Clock, t: 'Know what to expect', d: 'See the current desk, next step, and expected progress.' },
                ].map((x) => (
                  <div key={x.t} className="rounded-2xl border border-border bg-card p-5">
                    <x.icon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-sm font-semibold text-foreground">{x.t}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && fileDetails && (
            <div className="space-y-6 animate-fade-up">
              <StatusCard
                fileDetails={fileDetails}
                aiEstimate={aiEstimate}
                autoRefresh={autoRefresh}
                onAutoRefreshChange={onAutoRefreshChange}
              />

              <Card>
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icons.Layers className="h-4.5 w-4.5 text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Movement history — {fileDetails.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Registered {new Date(fileDetails.registeredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}Updated {new Date(fileDetails.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {fileDetails.timeline?.length > 0 ? (
                  <Timeline>
                    {fileDetails.timeline.map((item, idx) => (
                      <TimelineItem
                        key={`${item.timestamp}-${idx}`}
                        title={item.status}
                        meta={new Date(item.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        tone={CORRECTION_STATUSES.includes(item.status) || item.status === 'Rejected' ? 'red' : ['Approved', 'Verified', 'Dispatched'].includes(item.status) ? 'emerald' : 'primary'}
                      >
                        <p className="text-xs font-medium text-foreground/70">{item.location}</p>
                        {item.message && <p className="mt-1.5 rounded-lg border border-border/50 bg-muted/40 p-2.5">{item.message}</p>}
                      </TimelineItem>
                    ))}
                  </Timeline>
                ) : (
                  <p className="py-8 text-center text-xs italic text-muted-foreground">No movement recorded yet.</p>
                )}
              </Card>
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
          <div id="citizen-qr-reader" className="overflow-hidden rounded-xl border border-border bg-black [&_video]:!w-full" />
          {scannerInitializing && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Starting camera…
            </div>
          )}
          {scannerError && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-medium text-amber-600">{scannerError}</p>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={stopCameraScanner}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
