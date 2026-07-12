import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Container, Card, Button, Input, Badge, Icons, Skeleton, EmptyState, SectionLabel,
  Timeline, TimelineItem,
} from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';

const STEPS = ['Received', 'Pending', 'Approved', 'Dispatched'];

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

export default function CitizenTrackPage() {
  const [trackingId, setTrackingId] = useState('');
  const [fileDetails, setFileDetails] = useState(null);
  const [aiEstimate, setAiEstimate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setLoading(true);
    setError('');
    setAiEstimate(null);
    setSearched(true);
    try {
      const cleanId = trackingId.trim().toUpperCase();
      const [trackData, estimateData] = await Promise.all([
        api.trackCitizen(cleanId),
        api.estimateCompletion(cleanId).catch(() => null),
      ]);
      setFileDetails(trackData);
      setAiEstimate(estimateData);
    } catch (err) {
      setError(err.message || 'Tracking ID not found. Please check the ID and try again.');
      setFileDetails(null);
    } finally {
      setLoading(false);
    }
  };

  const activeStepIndex = useMemo(() => {
    if (!fileDetails) return -1;
    if (fileDetails.currentStatus === 'Backtracked') return 1;
    return Math.max(0, STEPS.indexOf(fileDetails.currentStatus));
  }, [fileDetails]);

  const statusMessage = useMemo(() => {
    if (!fileDetails) return null;
    if (fileDetails.currentStatus === 'Backtracked') return 'Your application requires a correction before it can continue.';
    if (fileDetails.currentStatus === 'Dispatched') return 'Your file has finished processing and is ready for collection.';
    if (aiEstimate?.estimatedMinutesRemaining) return `Under review in ${fileDetails.currentLocation}. Completion expected in about ${aiEstimate.estimatedMinutesRemaining} minutes.`;
    return `Your file is currently under review in ${fileDetails.currentLocation}.`;
  }, [fileDetails, aiEstimate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav />

      <main className="pb-20">
        {/* Hero + search */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-50" aria-hidden="true" />
          <Container className="relative py-14 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <SectionLabel>Citizen portal</SectionLabel>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">Track your government file</h1>
              <p className="mt-4 text-lg text-muted-foreground">Enter the tracking ID from your registration receipt to see live status — no account needed.</p>
            </div>

            <Card className="mx-auto mt-9 max-w-xl p-5 shadow-lg">
              <form onSubmit={handleTrackSubmit} className="flex flex-col gap-3 sm:flex-row">
                <Input id="trackingId" placeholder="e.g. TGTRACKA82" value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)} mono required disabled={loading}
                  className="flex-1" aria-label="Tracking ID" />
                <Button type="submit" variant="primary" size="md" className="shrink-0 sm:w-auto" loading={loading}>
                  {loading ? 'Searching…' : <>Track file <Icons.ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </Card>
          </Container>
        </section>

        <Container className="mt-10 max-w-4xl">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-6">
              <Skeleton className="h-40 w-full" />
              <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <EmptyState
              icon={<Icons.Search className="h-6 w-6" />}
              title="No file found"
              description={error}
              action={<Button variant="outline" onClick={() => { setError(''); setSearched(false); }}>Try another ID</Button>}
            />
          )}

          {/* Idle empty state */}
          {!loading && !error && !searched && (
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Icons.QrCode, t: 'Find your ID', d: 'It’s printed on your file receipt, starting with TG.' },
                { icon: Icons.Route, t: 'See live movement', d: 'Follow your file across every desk in real time.' },
                { icon: Icons.Clock, t: 'Know the wait', d: 'Get an AI estimate of how long it will take.' },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-border bg-card p-5">
                  <x.icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-sm font-semibold text-foreground">{x.t}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{x.d}</p>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && fileDetails && (
            <div className="space-y-6 animate-fade-up">
              {fileDetails.currentStatus === 'Backtracked' && (
                <div className="flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                  <Icons.AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">File returned for correction</h4>
                    <p className="mt-1 text-sm text-red-700/80 dark:text-red-400/80">
                      This file was returned to the <strong>{fileDetails.currentLocation}</strong>. Please report to the desk or contact support to resolve the issue.
                    </p>
                  </div>
                </div>
              )}

              <ProgressRail file={fileDetails} activeIndex={activeStepIndex} />

              <div className="grid items-start gap-6 md:grid-cols-[1fr_1.1fr]">
                <div className="space-y-6">
                  <Card className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] text-muted-foreground">{fileDetails.trackingId}</p>
                        <h2 className="mt-1.5 text-lg font-bold leading-snug text-foreground">{fileDetails.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{fileDetails.documentType} · Ward {fileDetails.wardCode}</p>
                      </div>
                      <Badge status={fileDetails.currentStatus} />
                    </div>
                    <hr className="my-5 border-border" />
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current desk</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">{fileDetails.currentLocation}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last updated</dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {new Date(fileDetails.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </dd>
                      </div>
                    </dl>
                  </Card>

                  <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-6">
                    <div className="flex items-center gap-2">
                      <Icons.Sparkles className="h-4.5 w-4.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">AI status insight</h4>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{statusMessage}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border bg-card p-3">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Expected wait</span>
                        <span className="mt-1 block text-sm font-bold text-foreground">
                          {aiEstimate?.estimatedMinutesRemaining ? `~${aiEstimate.estimatedMinutesRemaining} min` : '—'}
                        </span>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-3">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Confidence</span>
                        <span className="mt-1 block text-sm font-bold capitalize text-foreground">{aiEstimate?.confidence || 'medium'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Card className="p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <Icons.Layers className="h-4.5 w-4.5 text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Movement history</h4>
                  </div>
                  {fileDetails.timeline?.length > 0 ? (
                    <Timeline>
                      {fileDetails.timeline.map((item, idx) => (
                        <TimelineItem
                          key={idx}
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
