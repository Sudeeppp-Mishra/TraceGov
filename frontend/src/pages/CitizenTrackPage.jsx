import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Container, Card, Button, Input, Badge, Icons } from '../components/ui';

const STEPS = ['Received', 'Pending', 'Approved', 'Dispatched'];

export default function CitizenTrackPage() {
  const [trackingId, setTrackingId] = useState('');
  const [fileDetails, setFileDetails] = useState(null);
  const [aiEstimate, setAiEstimate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Execute tracking query
  const handleTrackSubmit = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;

    setLoading(true);
    setError('');
    setAiEstimate(null);

    try {
      const cleanId = trackingId.trim().toUpperCase();
      const [trackData, estimateData] = await Promise.all([
        api.trackCitizen(cleanId),
        api.estimateCompletion(cleanId).catch(() => null), // Fallback-safe if offline
      ]);

      setFileDetails(trackData);
      setAiEstimate(estimateData);
    } catch (err) {
      setError(err.message || 'Tracking ID not found. Verify ticket details and try again.');
      setFileDetails(null);
    } finally {
      setLoading(false);
    }
  };

  // Determine current active index on the progress tracker line
  const activeStepIndex = useMemo(() => {
    if (!fileDetails) return -1;
    if (fileDetails.currentStatus === 'Backtracked') return 1; // Pending corrections
    return Math.max(0, STEPS.indexOf(fileDetails.currentStatus));
  }, [fileDetails]);

  // Generates status message
  const statusMessage = useMemo(() => {
    if (!fileDetails) return 'Enter your tracking ID to see the latest status of your government file.';
    if (fileDetails.currentStatus === 'Backtracked') {
      return 'Your application requires correction before it can continue.';
    }
    if (fileDetails.currentStatus === 'Dispatched') {
      return 'Your file has finished processing and is ready for collection.';
    }
    if (aiEstimate?.estimatedMinutesRemaining) {
      return `Your file is under review in ${fileDetails.currentLocation}. Completion expected in about ${aiEstimate.estimatedMinutesRemaining} minutes.`;
    }
    return `Your file is currently under review in ${fileDetails.currentLocation}.`;
  }, [fileDetails, aiEstimate]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors pb-16">
      {/* Premium minimal header */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-40">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1 bg-primary rounded-full" />
            <h1 className="text-sm font-semibold uppercase tracking-wider text-foreground">TraceGov</h1>
          </div>
          
          <details className="relative">
            <summary className="list-none flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-all cursor-pointer select-none">
              Portal Sign In
              <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="absolute right-0 mt-1.5 w-40 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg animate-in fade-in slide-in-from-top-1">
              <Link to="/login?role=officer" className="block px-4 py-2 text-xs text-foreground hover:bg-muted font-medium">
                Officer Login
              </Link>
              <Link to="/login?role=admin" className="block px-4 py-2 text-xs text-foreground hover:bg-muted font-medium border-t border-border">
                Administrator Login
              </Link>
            </div>
          </details>
        </Container>
      </header>

      <main className="mt-8 md:mt-12">
        <Container className="max-w-4xl">
          {/* Headline intro */}
          <div className="text-center max-w-2xl mx-auto mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/70 mb-2">Citizen Portal</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">Track your government file.</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{statusMessage}</p>
          </div>

          {/* Core Tracking Search Card */}
          <Card className="max-w-lg mx-auto p-5 md:p-6 mb-8">
            <form onSubmit={handleTrackSubmit} className="space-y-4">
              <Input
                label="Enter Tracking ID"
                id="trackingId"
                placeholder="e.g. TGTRACKA82"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                mono
                required
                disabled={loading}
              />
              <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                {loading ? 'Fetching records...' : 'Query Live Ledger'}
              </Button>
            </form>
          </Card>

          {/* Validation errors */}
          {error && (
            <div className="max-w-lg mx-auto rounded-lg border border-red-500/10 bg-red-500/5 p-4 text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-2.5">
              <Icons.AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Track details output */}
          {fileDetails && !loading && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Progress Rail */}
              <Card className="p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6">Workflow Progress</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {STEPS.map((step, idx) => {
                    const isDone = idx <= activeStepIndex && fileDetails.currentStatus !== 'Backtracked';
                    const isActive = idx === activeStepIndex || (fileDetails.currentStatus === 'Backtracked' && step === 'Pending');
                    
                    return (
                      <div key={step} className={`rounded-lg border p-4 flex flex-col items-center text-center transition-all ${isDone ? 'border-emerald-500/20 bg-emerald-500/5' : isActive ? 'border-primary/20 bg-primary/5' : 'border-border bg-card/50'}`}>
                        <div className={`h-8 w-8 flex items-center justify-center rounded-full text-xs font-bold ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {idx + 1}
                        </div>
                        <p className="mt-2.5 text-xs font-semibold text-foreground">{step}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {isDone ? 'Completed' : isActive ? (fileDetails.currentStatus === 'Backtracked' ? 'Needs Correction' : 'Current Desk') : 'Queueing'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-start">
                <div className="space-y-6">
                  {/* General details */}
                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] text-muted-foreground">{fileDetails.trackingId}</p>
                        <h4 className="text-lg font-bold text-foreground mt-1.5 leading-snug">{fileDetails.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{fileDetails.documentType} · Ward {fileDetails.wardCode}</p>
                      </div>
                      <Badge status={fileDetails.currentStatus} />
                    </div>

                    <hr className="border-border my-4" />

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Current Section</p>
                        <p className="text-xs font-bold text-foreground mt-1">{fileDetails.currentLocation}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Last Action Date</p>
                        <p className="text-xs font-bold text-foreground mt-1">
                          {new Date(fileDetails.lastUpdated).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* AI Estimated completion card */}
                  <div className="rounded-xl border border-primary/10 bg-primary/[0.02] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Icons.Sparkles className="h-4.5 w-4.5 text-primary" />
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">AI Delay Congestion Insights</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{statusMessage}</p>
                    
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-lg border border-border bg-card p-3">
                        <span className="block text-[10px] font-medium text-muted-foreground uppercase">Expected wait</span>
                        <span className="block text-sm font-bold mt-1 text-foreground">
                          {aiEstimate?.estimatedMinutesRemaining ? `~${aiEstimate.estimatedMinutesRemaining} mins` : 'Pending data'}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-3">
                        <span className="block text-[10px] font-medium text-muted-foreground uppercase">Model confidence</span>
                        <span className="block text-sm font-bold capitalize mt-1 text-foreground">
                          {aiEstimate?.confidence || 'medium'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Backtrack warnings */}
                  {fileDetails.currentStatus === 'Backtracked' && (
                    <div className="rounded-xl border border-red-500/10 bg-red-500/[0.02] p-5 flex gap-3">
                      <Icons.AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-red-800 dark:text-red-300">File Returned for Correction</h4>
                        <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-1.5 leading-relaxed">
                          The office returned this file to the <strong>{fileDetails.currentLocation}</strong>. Please report to the desk or contact support to resolve details.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icons.Layers className="h-4.5 w-4.5 text-muted-foreground" />
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Historical Audit Track</h4>
                  </div>
                  
                  {fileDetails.timeline && fileDetails.timeline.length > 0 ? (
                    <div className="relative border-l border-border ml-2 pl-4 py-1.5 space-y-6">
                      {fileDetails.timeline.map((item, idx) => (
                        <div key={idx} className="relative">
                          {/* Circle bullet */}
                          <span className="absolute -left-[21px] mt-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background ring-4 ring-background" />
                          
                          <div>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="text-xs font-bold text-foreground">{item.status}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{item.location}</p>
                              </div>
                              <span className="text-[9px] font-medium text-muted-foreground mt-0.5">
                                {new Date(item.timestamp).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 bg-muted/40 rounded-lg p-2.5 border border-border/20">
                              {item.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-6">No logs registered yet.</p>
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
