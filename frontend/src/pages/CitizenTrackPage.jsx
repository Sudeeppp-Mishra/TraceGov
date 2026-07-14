import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Container, Card, Button, Input, Badge, Icons, Skeleton, EmptyState, SectionLabel,
  Timeline, TimelineItem,
} from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';

const STEPS = ['Received', 'Pending', 'Approved', 'Dispatched'];

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
  Approved: {
    title: 'Your file has been approved.',
    summary: 'The required review has been completed successfully.',
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
  if (fileDetails.currentStatus === 'Backtracked') return 'After the requested correction is resolved';
  if (aiEstimate?.estimatedMinutesRemaining) return `About ${aiEstimate.estimatedMinutesRemaining} minutes`;
  return 'The next update will appear when the current desk moves the file';
}

function getNextStep(fileDetails) {
  if (fileDetails.currentStatus === 'Dispatched') {
    return {
      title: 'Collect or archive the completed file',
      description: 'The file journey is complete. If a physical document is required, visit the dispatch counter with your receipt.',
      department: 'Dispatch Counter',
    };
  }

  if (fileDetails.currentStatus === 'Backtracked') {
    return {
      title: 'Resolve the correction request',
      description: 'After the correction is accepted, the file can continue through the approval path.',
      department: fileDetails.currentLocation,
    };
  }

  if (fileDetails.currentStatus === 'Approved') {
    return {
      title: 'Dispatch preparation',
      description: 'The office will prepare the final output and mark the file ready for collection or dispatch.',
      department: 'Dispatch Counter',
    };
  }

  return {
    title: 'Department review completion',
    description: 'The current desk will either forward the file, approve it, or request a correction if something is missing.',
    department: fileDetails.currentLocation,
  };
}

function ProgressRail({ file, activeIndex }) {
  return (
    <Card className="p-6">
      <h3 className="mb-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Application progress</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STEPS.map((step, idx) => {
          const backtracked = file.currentStatus === 'Backtracked';
          const isDone = idx <= activeIndex && !backtracked;
          const isActive = idx === activeIndex || (backtracked && step === 'Pending');
          return (
            <div key={step} className={`flex flex-col items-center rounded-xl border p-4 text-center transition-all ${
              isDone ? 'border-emerald-500/30 bg-emerald-500/5' : isActive ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'
            }`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {isDone ? <Icons.Check className="h-4 w-4" /> : idx + 1}
              </div>
              <p className="mt-2.5 text-xs font-semibold text-foreground">{step}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {isDone ? 'Completed' : isActive ? (file.currentStatus === 'Backtracked' ? 'Needs correction' : 'In progress') : 'Pending'}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TransparencyAnswer({ fileDetails, aiEstimate }) {
  const statusCopy = getStatusCopy(fileDetails.currentStatus);
  const latestReason = getLatestReason(fileDetails.timeline);
  const nextStep = getNextStep(fileDetails);
  const expectedUpdate = getExpectedUpdate(fileDetails, aiEstimate);
  const needsAction = fileDetails.currentStatus === 'Backtracked';

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-muted/30 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Current answer</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-4xl">{statusCopy.title}</h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{statusCopy.summary}</p>
          </div>
          <Badge status={fileDetails.currentStatus} />
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-3">
        <InfoPanel
          icon={Icons.Building}
          label="Where is my file?"
          title={fileDetails.currentLocation || 'Not recorded'}
          description="This is the department currently responsible for the next update."
        />
        <InfoPanel
          icon={Icons.Clock}
          label="When should I expect progress?"
          title={expectedUpdate}
          description={aiEstimate?.confidence ? `Estimate confidence: ${aiEstimate.confidence}` : 'Based on the latest recorded movement.'}
        />
        <InfoPanel
          icon={needsAction ? Icons.AlertCircle : Icons.CheckCircle}
          label="Do I need to do anything?"
          title={needsAction ? 'Yes, action is needed' : 'No action needed'}
          description={statusCopy.citizenAction}
          tone={needsAction ? 'danger' : 'success'}
        />
      </div>

      <div className="border-t border-border p-6">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <Icons.Route className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{nextStep.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{nextStep.description}</p>
            <p className="mt-3 text-xs font-semibold text-foreground">Responsible area: {nextStep.department}</p>
          </div>
        </div>

        {needsAction && latestReason && (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Latest correction reason</p>
            <p className="mt-1 text-sm font-medium text-red-700/90 dark:text-red-300/90">{latestReason}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function InfoPanel({ icon: Icon, label, title, description, tone = 'default' }) {
  const iconTone = tone === 'danger' ? 'text-red-500' : tone === 'success' ? 'text-emerald-500' : 'text-primary';

  return (
    <div className="border-border p-6 md:border-r md:last:border-r-0">
      <Icon className={`h-5 w-5 ${iconTone}`} />
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <h3 className="mt-1 text-base font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
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

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const activeStepIndex = useMemo(() => {
    if (!fileDetails) return -1;
    if (fileDetails.currentStatus === 'Backtracked') return 1;
    return Math.max(0, STEPS.indexOf(fileDetails.currentStatus));
  }, [fileDetails]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="pb-20">
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-50" aria-hidden="true" />
          <Container className="relative py-14 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>Citizen portal</SectionLabel>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Track your government file</h1>
              <p className="mt-4 text-lg text-muted-foreground">Enter the tracking ID from your receipt to see where your file is, who has it, and what happens next.</p>
            </div>

            <Card className="mx-auto mt-9 max-w-xl p-5 shadow-lg">
              <form onSubmit={handleTrackSubmit} className="flex flex-col gap-3 sm:flex-row">
                <Input id="trackingId" placeholder="e.g. TGTRACKA82" value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)} mono required disabled={loading}
                  className="flex-1" aria-label="Tracking ID" />
                <Button type="submit" variant="primary" size="md" className="shrink-0 sm:w-auto" loading={loading}>
                  {loading ? 'Searching...' : <>Track file <Icons.ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </Card>
          </Container>
        </section>

        <Container className="mt-10 max-w-5xl">
          {loading && (
            <div className="space-y-6">
              <Skeleton className="h-56 w-full" />
              <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
              </div>
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
                <Card className="p-5">
                  <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent searches</h4>
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
                  { icon: Icons.QrCode, t: 'Find your ID', d: 'It is printed on your file receipt, starting with TG.' },
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
              <TransparencyAnswer fileDetails={fileDetails} aiEstimate={aiEstimate} />

              <ProgressRail file={fileDetails} activeIndex={activeStepIndex} />

              {fileDetails.currentStatus !== 'Dispatched' && (
                <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-xs font-semibold">
                  <label className="flex items-center gap-2 text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => {
                        setAutoRefresh(e.target.checked);
                        if (e.target.checked) requestNotificationPermission();
                      }}
                      className="h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary/20 accent-primary"
                    />
                    Auto-refresh status every 30 seconds
                  </label>
                  {autoRefresh && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Live monitoring active
                    </span>
                  )}
                </div>
              )}

              <div className="grid items-start gap-6 md:grid-cols-[0.8fr_1.2fr]">
                <Card className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] text-muted-foreground">{fileDetails.trackingId}</p>
                      <h2 className="mt-1.5 text-lg font-bold leading-snug text-foreground">{fileDetails.title}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{fileDetails.documentType} · Ward {fileDetails.wardCode}</p>
                    </div>
                    <Icons.FileText className="h-5 w-5 text-primary" />
                  </div>
                  <hr className="my-5 border-border" />
                  <dl className="space-y-4">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Registered</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {new Date(fileDetails.registeredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last updated</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {new Date(fileDetails.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card className="p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <Icons.Layers className="h-4.5 w-4.5 text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Movement history</h4>
                  </div>
                  {fileDetails.timeline?.length > 0 ? (
                    <Timeline>
                      {fileDetails.timeline.map((item, idx) => (
                        <TimelineItem
                          key={`${item.timestamp}-${idx}`}
                          title={item.status}
                          meta={new Date(item.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          tone={item.status === 'Backtracked' ? 'red' : item.status === 'Approved' || item.status === 'Dispatched' ? 'emerald' : 'primary'}
                          last={idx === fileDetails.timeline.length - 1}
                        >
                          <p className="text-[11px] font-medium text-foreground/70">{item.location}</p>
                          {item.message && <p className="mt-1.5 rounded-lg border border-border/50 bg-muted/40 p-2.5">{item.message}</p>}
                        </TimelineItem>
                      ))}
                    </Timeline>
                  ) : (
                    <p className="py-8 text-center text-xs italic text-muted-foreground">No movement recorded yet.</p>
                  )}
                </Card>
              </div>
            </div>
          )}
        </Container>
      </main>
    </div>
  );
}
