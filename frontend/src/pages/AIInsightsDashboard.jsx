import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Icons, Skeleton, EmptyState, StatCard } from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

export default function AIInsightsDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [queuePrediction, setQueuePrediction] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [highRiskFiles, setHighRiskFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    loadTelemetry(user.wardCode);
  }, [navigate]);

  const loadTelemetry = async (wardCode) => {
    setLoading(true);
    setError('');
    try {
      const [summary, bottleneckData] = await Promise.all([
        api.dashboardSummary({ wardCode }),
        api.getBottlenecks({ wardCode }).catch(() => ({ bottlenecks: [] })),
      ]);
      setMetrics(summary.metrics);
      setQueuePrediction(summary.queuePrediction);
      setAiInsights(summary.ai);
      setBottlenecks(bottleneckData.bottlenecks || []);
      const files = summary.recentFiles || [];
      setHighRiskFiles(files.filter((f) => f.ai?.risk?.score > 50 || f.currentStatus === 'Backtracked'));
    } catch (err) {
      setError(err.message || 'Error collecting AI telemetry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell user={currentUser} kicker="AI Insights">
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
          title="Operational congestion analytics"
          description="Predictions on delays, bottlenecks and completion times based on live desk queues and movement logs."
          actions={<Button variant="outline" onClick={() => loadTelemetry(currentUser.wardCode)}><Icons.Zap className="h-4 w-4" /> Refresh</Button>}
        />

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm font-medium text-red-600 dark:text-red-400">
            <Icons.AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-up">
            {queuePrediction && (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Arrival rate (λ)" value={`${queuePrediction.arrivalRate}`} trend="files / hour" icon={<Icons.ArrowRight className="h-5 w-5" />} />
                <StatCard label="Service rate (μ)" value={`${queuePrediction.serviceRate}`} trend="files / hour" icon={<Icons.Zap className="h-5 w-5" />} tone="emerald" />
                <StatCard label="Utilization (ρ)" value={`${Math.round(queuePrediction.utilization * 100)}%`} trend={queuePrediction.utilization > 0.85 ? 'High load' : 'Stable'} icon={<Icons.BarChart className="h-5 w-5" />} tone={queuePrediction.utilization > 0.85 ? 'red' : 'default'} />
                <StatCard label="Expected wait" value={`~${queuePrediction.expectedWaitingMinutes}m`} trend={`Confidence: ${queuePrediction.predictionConfidence}`} icon={<Icons.Clock className="h-5 w-5" />} />
              </div>
            )}

            <div className="grid items-start gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <Card className="p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <Icons.Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Department bottlenecks</h3>
                  </div>
                  {bottlenecks.length > 0 ? (
                    <div className="space-y-4">
                      {bottlenecks.map((item, index) => {
                        const maxVal = bottlenecks[0].avgDwellMinutes || 1;
                        const pct = Math.max(8, Math.min(100, (item.avgDwellMinutes / maxVal) * 100));
                        return (
                          <div key={item.location} className="space-y-1.5 text-xs">
                            <div className="flex justify-between font-semibold text-foreground">
                              <span>{item.location}</span>
                              <span className="text-muted-foreground">{item.avgDwellMinutes}m avg dwell</span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                              <div style={{ width: `${pct}%` }} className={`h-full rounded-full transition-all duration-700 ${index === 0 ? 'bg-red-500' : index === 1 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState className="border-0" icon={<Icons.BarChart className="h-6 w-6" />} title="No dwell data yet" description="Bottleneck rankings appear once files move between desks." />
                  )}
                </Card>

                {queuePrediction && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-5">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">M/M/1 stability:</strong> desk capacity is {queuePrediction.utilization > 0.85 ? 'under strain' : 'stable'}. Prediction confidence is <strong className="text-foreground">{queuePrediction.predictionConfidence}</strong> based on recent movement history.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {aiInsights && (
                  <Card className="border-l-4 border-l-emerald-500 p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <Icons.Sparkles className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Staff reallocation assistant</h3>
                    </div>
                    <p className="rounded-xl border border-border/50 bg-muted/40 p-3.5 text-sm font-medium leading-relaxed text-foreground">{aiInsights.recommendation}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Bottleneck area</span>
                        <span className="mt-0.5 block font-bold text-foreground">{aiInsights.bottleneckDepartment}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Delay probability</span>
                        <span className="mt-0.5 block font-bold text-foreground">{aiInsights.delayProbability}%</span>
                      </div>
                    </div>
                  </Card>
                )}

                <Card className="p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <Icons.AlertCircle className="h-4.5 w-4.5 text-red-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">High-risk watch</h3>
                  </div>
                  {highRiskFiles.length > 0 ? (
                    <div className="divide-y divide-border">
                      {highRiskFiles.map((file) => (
                        <div key={file.fileUid} className="py-3.5 text-xs first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[9px] text-muted-foreground">{file.fileUid}</span>
                            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-500">{file.ai?.risk?.score || 85}% risk</span>
                          </div>
                          <p className="mt-1.5 flex items-center gap-1.5 font-bold text-foreground">
                            <span className="truncate">{file.title}</span>
                            {!['Approved', 'Verified', 'Dispatched'].includes(file.currentStatus) && (
                              <span className="relative flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500"></span>
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">At <strong>{file.currentLocation}</strong> · {file.currentStatus}</p>
                          {file.ai?.missingDocuments?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {file.ai.missingDocuments.map((doc) => (
                                <span key={doc} className="rounded bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">Missing {doc}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState className="border-0" icon={<Icons.CheckCircle className="h-6 w-6" />} title="All clear" description="No files are currently flagged with delay risk." />
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </Container>
    </AppShell>
  );
}
