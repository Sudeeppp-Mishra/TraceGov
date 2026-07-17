import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Icons, Skeleton, EmptyState, StatCard, Alert, BarList, Badge } from '../components/ui';
import { AppShell, PageHeading } from '../components/layout';

export default function AIInsightsDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
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

  const utilizationPct = queuePrediction ? Math.round(queuePrediction.utilization * 100) : 0;

  return (
    <AppShell user={currentUser}>
      <Container size="wide" className="space-y-8 pt-8">
        <PageHeading
          breadcrumbs={['Workspace', 'AI Insights']}
          title="Queue & delay analytics"
          description="Where files are piling up in your ward, and which ones are at risk of delay."
          actions={<Button variant="outline" onClick={() => loadTelemetry(currentUser.wardCode)}><Icons.Zap className="h-4 w-4" /> Refresh</Button>}
        />

        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-up">
            {queuePrediction && (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Files arriving" value={`${queuePrediction.arrivalRate}`} trend="per hour" icon={<Icons.ArrowRight className="h-5 w-5" />} />
                <StatCard label="Files processed" value={`${queuePrediction.serviceRate}`} trend="per hour" icon={<Icons.Zap className="h-5 w-5" />} tone="emerald" />
                <StatCard
                  label="Desk load"
                  value={`${utilizationPct}%`}
                  trend={utilizationPct > 85 ? 'Backlog will grow at this pace' : 'Queue is keeping up'}
                  icon={<Icons.BarChart className="h-5 w-5" />}
                  tone={utilizationPct > 85 ? 'red' : 'default'}
                />
                <StatCard label="Expected wait" value={`~${queuePrediction.expectedWaitingMinutes}m` } trend={`Confidence: ${queuePrediction.predictionConfidence}`} icon={<Icons.Clock className="h-5 w-5" />} />
              </div>
            )}

            <div className="grid items-start gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <div className="mb-5 flex items-center gap-2">
                  <Icons.Layers className="h-4.5 w-4.5 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Slowest desks</h3>
                </div>
                {bottlenecks.length > 0 ? (
                  <BarList
                    data={bottlenecks.map((item, index) => ({
                      label: item.location,
                      value: item.avgDwellMinutes,
                      tone: index === 0 ? 'red' : index === 1 ? 'amber' : 'emerald',
                    }))}
                    valueFormat={(v) => `${v}m avg dwell`}
                  />
                ) : (
                  <EmptyState className="border-0" icon={<Icons.BarChart className="h-6 w-6" />} title="No dwell data yet" description="Rankings appear once files move between desks." />
                )}
              </Card>

              <div className="space-y-6">
                {aiInsights && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <Icons.Sparkles className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Staff reallocation assistant</h3>
                    </div>
                    <p className="rounded-xl border border-border/50 bg-muted/40 p-3.5 text-sm font-medium leading-relaxed text-foreground">{aiInsights.recommendation}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">Bottleneck area</dt>
                        <dd className="mt-0.5 text-sm font-bold text-foreground">{aiInsights.bottleneckDepartment}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">Delay probability</dt>
                        <dd className="mt-0.5 text-sm font-bold text-foreground">{aiInsights.delayProbability}%</dd>
                      </div>
                    </dl>
                  </Card>
                )}

                <Card>
                  <div className="mb-4 flex items-center gap-2">
                    <Icons.AlertCircle className="h-4.5 w-4.5 text-red-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">High-risk watch</h3>
                  </div>
                  {highRiskFiles.length > 0 ? (
                    <div className="divide-y divide-border">
                      {highRiskFiles.map((file) => (
                        <div key={file.fileUid} className="py-3.5 text-xs first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{file.fileUid}</span>
                            <Badge status={file.currentStatus} />
                          </div>
                          <p className="mt-1.5 truncate font-bold text-foreground">{file.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            At <strong>{file.currentLocation}</strong>
                            {file.ai?.risk?.score ? ` · ${file.ai.risk.score}% delay risk` : ''}
                          </p>
                          {file.ai?.missingDocuments?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {file.ai.missingDocuments.map((doc) => (
                                <span key={doc} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Missing {doc}</span>
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
