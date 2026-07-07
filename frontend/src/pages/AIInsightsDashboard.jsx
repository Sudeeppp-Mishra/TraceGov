import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getStoredUser } from '../lib/api';

function InsightCard({ title, value, subtitle, tone = 'blue' }) {
  const toneMap = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    slate: 'border-slate-200 bg-white text-slate-900',
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneMap[tone]}`}>
      <p className="text-sm font-semibold opacity-75">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      {subtitle && <p className="mt-2 text-xs opacity-75">{subtitle}</p>}
    </div>
  );
}

function Meter({ label, value, color = 'bg-blue-600' }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function SimpleBars({ data = [] }) {
  const max = useMemo(() => Math.max(...data.map((item) => item.count || item.processed || 0), 1), [data]);
  return (
    <div className="flex h-44 items-end gap-3 border-b border-slate-200 pt-4">
      {data.slice(0, 8).map((item) => {
        const value = item.count || item.processed || 0;
        return (
          <div key={item._id || item.name} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-lg bg-blue-600" style={{ height: `${Math.max(10, (value / max) * 150)}px` }} />
            <span className="max-w-20 truncate text-xs text-slate-500">{item._id || item.name || 'Desk'}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AIInsightsDashboard() {
  const user = getStoredUser();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        setSummary(await api.dashboardSummary());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const metrics = summary?.metrics || {};
  const queue = summary?.queuePrediction || {};
  const ai = summary?.ai || {};

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">TraceGov AI</p>
            <h1 className="text-3xl font-bold">AI Control Center</h1>
            <p className="mt-1 text-sm text-slate-500">Queue theory, delay prediction, document risk, and operational bottlenecks.</p>
          </div>
          <Link to={user?.role === 'admin' ? '/admin' : '/officer'} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:border-blue-300">
            {user?.role === 'admin' ? 'Admin Dashboard' : 'Officer Dashboard'}
          </Link>
        </header>

        {loading && (
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        )}

        {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InsightCard title="Pending Files" value={metrics.pendingFiles || 0} subtitle="Current active queue" tone="orange" />
              <InsightCard title="Completed Files" value={metrics.completedFiles || 0} subtitle="Approved and dispatched" tone="green" />
              <InsightCard title="Average Completion Time" value={metrics.averageProcessingMinutes ? `${Math.round(metrics.averageProcessingMinutes / 60)}h` : 'No sample'} subtitle="From recent completed movement logs" />
              <InsightCard title="Today's Registrations" value={metrics.todaysFiles || 0} subtitle="Newly entered files" />
              <InsightCard title="Average Queue Length" value={queue.averageQueueLength || 0} subtitle="Files per department" tone="slate" />
              <InsightCard title="Backtracking Today" value={metrics.backtrackingToday || 0} subtitle="Returned for corrections" tone="red" />
              <InsightCard title="Missing Document Alerts" value={ai.missingDocumentAlerts || 0} subtitle="Detected from required document patterns" tone="red" />
              <InsightCard title="Prediction Confidence" value={queue.predictionConfidence || 'medium'} subtitle="Based on movement sample size" tone="green" />
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">M/M/1 Queue Prediction</h2>
                    <p className="text-sm text-slate-500">Arrival and service rates are estimated from today&apos;s registrations and current queue load.</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Model: M/M/1</span>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <InsightCard title="Arrival Rate" value={`${queue.arrivalRate || 0}/h`} subtitle="Files entering queue" tone="slate" />
                  <InsightCard title="Service Rate" value={`${queue.serviceRate || 0}/h`} subtitle="Estimated desk capacity" tone="slate" />
                  <InsightCard title="Expected Wait" value={`${queue.expectedWaitingMinutes || 0}m`} subtitle="Per remaining service cycle" tone="slate" />
                </div>
                <div className="mt-6 space-y-5">
                  <Meter label="Utilization" value={Math.round((queue.utilization || 0) * 100)} color="bg-orange-500" />
                  <Meter label="Delay Probability" value={ai.delayProbability || 0} color="bg-red-500" />
                  <Meter label="Risk Score" value={ai.riskScore || 0} color="bg-blue-600" />
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Bottleneck Detection</h2>
                <p className="mt-1 text-sm text-slate-500">Slow departments, congested queues, and recommended action.</p>
                <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5">
                  <p className="text-sm font-semibold text-orange-700">Top Bottleneck</p>
                  <p className="mt-2 text-2xl font-bold text-orange-950">{ai.bottleneckDepartment || 'No bottleneck'}</p>
                  <p className="mt-3 text-sm text-orange-800">{ai.recommendation || 'More movement data will improve AI recommendations.'}</p>
                </div>
                <div className="mt-5 space-y-3">
                  {(summary?.departmentQueue || []).slice(0, 5).map((item) => (
                    <div key={item._id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                      <span className="font-medium">{item._id}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{item.count} files</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Department Performance</h2>
                <SimpleBars data={summary?.departmentQueue || []} />
              </div>

              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Officer Productivity</h2>
                <SimpleBars data={summary?.officerStats || []} />
                <div className="mt-5 space-y-3">
                  {(summary?.officerStats || []).slice(0, 4).map((officer) => (
                    <div key={officer._id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="font-semibold">{officer.name || 'Officer'}</p>
                        <p className="text-xs text-slate-500">{officer.deskLocation || 'Desk'} · {officer.backtracked || 0} backtracked</p>
                      </div>
                      <span className="text-lg font-bold">{officer.processed}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-white bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Document Intelligence</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {(summary?.recentFiles || []).slice(0, 6).map((file) => (
                  <div key={file._id} className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-sm font-bold">{file.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{file.fileUid} · {file.documentType}</p>
                    <p className="mt-4 text-sm text-slate-700">{file.ai?.citizenMessage}</p>
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
                      Missing: <strong>{file.ai?.missingDocuments?.length ? file.ai.missingDocuments.join(', ') : 'None highlighted'}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
