import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';
import { Container, Card, Button, Badge, Icons } from '../components/ui';

export default function AIInsightsDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  // Telemetry data states
  const [metrics, setMetrics] = useState(null);
  const [queuePrediction, setQueuePrediction] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [highRiskFiles, setHighRiskFiles] = useState([]);

  // States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      navigate('/login');
      return;
    }
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
      
      // Filter recent files to show only high-risk ones
      const files = summary.recentFiles || [];
      const riskFiles = files.filter((f) => f.ai?.risk?.score > 50 || f.currentStatus === 'Backtracked');
      setHighRiskFiles(riskFiles);
    } catch (err) {
      setError(err.message || 'Error collecting AI operational telemetry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors pb-16">
      
      {/* Header */}
      <header className="border-b border-border bg-card/65 backdrop-blur-md sticky top-0 z-40">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1 bg-teal-600 rounded-full" />
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">TraceGov AI Insights</span>
            {currentUser && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                Ward {currentUser.wardCode} Operations
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Link to="/officer" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all">
              Go to Workspace
            </Link>
            <Button variant="outline" onClick={() => loadTelemetry(currentUser.wardCode)} className="py-1 px-3 text-xs">
              Refresh Stats
            </Button>
          </div>
        </Container>
      </header>

      <main className="mt-8">
        <Container className="space-y-8">
          
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Operational congestion analytics</h2>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              This dashboard provides predictions on delays, bottlenecks, and completion times based on physical desk queues and movement logs.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-4 text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-2.5">
              <Icons.AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-muted-foreground italic text-center py-12">Parsing historical metrics and logs...</p>
          ) : (
            <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-start animate-in fade-in duration-200">
              
              <div className="space-y-6">
                
                {/* M/M/1 Queue parameters */}
                {queuePrediction && (
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Icons.Clock className="h-4.5 w-4.5 text-primary" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">M/M/1 Queue Model Parameters</h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Arrival Speed (λ)</span>
                        <span className="block text-lg font-bold text-foreground mt-1">{queuePrediction.arrivalRate} f/hr</span>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Service Speed (μ)</span>
                        <span className="block text-lg font-bold text-foreground mt-1">{queuePrediction.serviceRate} f/hr</span>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Utilization (ρ)</span>
                        <span className="block text-lg font-bold text-foreground mt-1">{Math.round(queuePrediction.utilization * 100)}%</span>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <span className="block text-[9px] uppercase font-semibold text-muted-foreground">Expected wait</span>
                        <span className="block text-lg font-bold text-foreground mt-1">~{queuePrediction.expectedWaitingMinutes}m</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-lg p-3 border border-border/20">
                      <strong>Stability Condition:</strong> Desk capacity is stable. Confidence in predictions is currently{' '}
                      <strong>{queuePrediction.predictionConfidence}</strong> based on recent history logs.
                    </p>
                  </Card>
                )}

                {/* Bottleneck Departments */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icons.Layers className="h-4.5 w-4.5 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Department Bottleneck Ranks</h3>
                  </div>

                  {bottlenecks.length > 0 ? (
                    <div className="space-y-4">
                      {bottlenecks.map((item, index) => {
                        const maxVal = bottlenecks[0].avgDwellMinutes || 1;
                        const pct = Math.max(10, Math.min(100, (item.avgDwellMinutes / maxVal) * 100));
                        
                        return (
                          <div key={item.location} className="space-y-1.5 text-xs">
                            <div className="flex justify-between font-semibold text-foreground">
                              <span>{item.location}</span>
                              <span className="text-muted-foreground">{item.avgDwellMinutes}m average dwell</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full rounded-full transition-all ${index === 0 ? 'bg-red-500' : index === 1 ? 'bg-amber-500' : 'bg-teal-600'}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-6">No historical dwell times calculated yet.</p>
                  )}
                </Card>

              </div>

              {/* Sidebar Delay Alerts & Recommendations */}
              <div className="space-y-6">
                
                {/* AI Suggestions Card */}
                {aiInsights && (
                  <Card className="p-5 border-l-4 border-l-teal-600">
                    <div className="flex items-center gap-2 mb-3">
                      <Icons.Sparkles className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Staff reallocation assistant</h3>
                    </div>
                    <p className="text-xs text-foreground font-medium leading-relaxed bg-muted/40 rounded-lg p-3.5 border border-border/20">
                      {aiInsights.recommendation}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Bottleneck Area</span>
                        <span className="block font-bold text-foreground mt-0.5">{aiInsights.bottleneckDepartment}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-muted-foreground uppercase font-semibold">Delay Probability</span>
                        <span className="block font-bold text-foreground mt-0.5">{aiInsights.delayProbability}%</span>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Priority Delay Alerts List */}
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Icons.AlertCircle className="h-4.5 w-4.5 text-red-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">High-Risk Congestion Watch</h3>
                  </div>

                  {highRiskFiles.length > 0 ? (
                    <div className="divide-y divide-border pr-1">
                      {highRiskFiles.map((file) => (
                        <div key={file.fileUid} className="py-3.5 first:pt-0 last:pb-0 text-xs">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-mono text-[9px] text-muted-foreground">{file.fileUid}</span>
                            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-500">
                              {file.ai?.risk?.score || 85}% risk
                            </span>
                          </div>
                          <p className="font-bold text-foreground mt-1.5">{file.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Located at: <strong>{file.currentLocation}</strong> ({file.currentStatus})
                          </p>
                          {file.ai?.missingDocuments && file.ai.missingDocuments.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {file.ai.missingDocuments.map((doc) => (
                                <span key={doc} className="rounded bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                                  Missing {doc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic text-center py-6">No files currently flagged with delay risks.</p>
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
