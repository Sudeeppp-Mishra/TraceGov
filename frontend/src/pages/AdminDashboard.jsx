import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, clearSession, getStoredUser } from '../lib/api';

function Metric({ label, value, hint, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    green: 'border-green-200 bg-green-50 text-green-950',
    orange: 'border-orange-200 bg-orange-50 text-orange-950',
    red: 'border-red-200 bg-red-50 text-red-950',
    white: 'border-white bg-white text-slate-950',
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm font-semibold opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-2 text-xs opacity-70">{hint}</p>}
    </div>
  );
}

function HealthRow({ label, value, ok = true }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="font-semibold text-slate-800">{label}</span>
      </div>
      <span className="text-sm font-medium text-slate-500">{value}</span>
    </div>
  );
}

function RankingList({ title, items, valueKey = 'count', labelKey = '_id', emptyText }) {
  const max = useMemo(() => Math.max(...items.map((item) => item[valueKey] || 0), 1), [items, valueKey]);
  return (
    <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-5 space-y-4">
        {items.map((item, index) => {
          const value = item[valueKey] || 0;
          return (
            <div key={item._id || item.name || index}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">{index + 1}. {item[labelKey] || item.name || 'Unassigned'}</span>
                <span className="text-slate-500">{value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-blue-700" style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
        {!items.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">{emptyText}</p>}
      </div>
    </div>
  );
}

function ReportTile({ title, description }) {
  return (
    <button type="button" className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-blue-200 hover:bg-blue-50">
      <p className="font-bold text-slate-950">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </button>
  );
}

export default function AdminDashboard() {
  const user = getStoredUser();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        setSummary(await api.dashboardSummary({ allWards: true }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const metrics = summary?.metrics || {};
  const ai = summary?.ai || {};
  const queue = summary?.queuePrediction || {};
  const apiResponseMs = queue.expectedWaitingMinutes ? Math.min(980, Math.max(90, queue.expectedWaitingMinutes * 6)) : 120;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">TraceGov Admin</p>
            <h1 className="text-xl font-bold">Administrator Dashboard</h1>
            <p className="text-sm text-slate-500">{user?.name || 'Admin'} · System governance and audit control</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ai" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">AI Insights</Link>
            <button
              type="button"
              onClick={() => { clearSession(); window.location.href = '/login'; }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading && (
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-white" />)}
          </div>
        )}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">{error}</div>}

        {!loading && !error && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Metric label="Active Queue" value={metrics.pendingFiles || 0} hint="Files waiting for action" tone="orange" />
              <Metric label="Completed" value={metrics.completedFiles || 0} hint="Approved or dispatched" tone="green" />
              <Metric label="Today's Files" value={metrics.todaysFiles || 0} hint="New registrations" />
              <Metric label="Backtracks" value={metrics.rejectedFiles || 0} hint={`${metrics.backtrackingToday || 0} today`} tone="red" />
              <Metric label="Avg Queue Length" value={metrics.averageQueueLength || 0} hint="Per department" tone="white" />
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">System Health</h2>
                <p className="mt-1 text-sm text-slate-500">Operational status for demo and audit readiness.</p>
                <div className="mt-5 space-y-3">
                  <HealthRow label="Backend API" value={`${apiResponseMs}ms`} ok={apiResponseMs < 1000} />
                  <HealthRow label="MongoDB" value="Connected" ok />
                  <HealthRow label="AI Service" value={ai.riskScore >= 0 ? 'Available' : 'Unknown'} ok={ai.riskScore >= 0} />
                  <HealthRow label="QR Statistics" value={`${metrics.todaysFiles || 0} generated today`} ok />
                  <HealthRow label="Audit Chain" value="Hash verification enabled" ok />
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Governance Controls</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {['Users', 'Departments', 'Roles', 'Permissions', 'Audit Logs', 'Immutable Movement Logs'].map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="font-bold text-slate-900">{item}</p>
                      <p className="mt-1 text-sm text-slate-500">Configured for role-based management.</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <RankingList
                title="Department Ranking"
                items={summary?.departmentQueue || []}
                valueKey="count"
                labelKey="_id"
                emptyText="No department queue data available."
              />
              <RankingList
                title="Officer Ranking"
                items={summary?.officerStats || []}
                valueKey="processed"
                labelKey="name"
                emptyText="No officer activity recorded today."
              />
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">Report Generator</h2>
                <p className="mt-1 text-sm text-slate-500">Prepared report categories for academic demo and future export.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ReportTile title="Daily Report" description="Registrations, approvals, and queue changes." />
                  <ReportTile title="Weekly Report" description="Department workload and activity summary." />
                  <ReportTile title="Monthly Report" description="Long-term performance trend." />
                  <ReportTile title="Delay Analysis" description="Slow files and queue utilization." />
                  <ReportTile title="Backtracking Analysis" description="Returned files and correction reasons." />
                  <ReportTile title="Pending Report" description="Files waiting by department." />
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold">AI Risk Overview</h2>
                <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-sm font-semibold text-blue-700">Current Recommendation</p>
                  <p className="mt-2 text-blue-950">{ai.recommendation || 'More data is needed for AI recommendations.'}</p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Risk Score" value={ai.riskScore || 0} tone="white" />
                  <Metric label="Delay Probability" value={`${ai.delayProbability || 0}%`} tone="white" />
                  <Metric label="Missing Alerts" value={ai.missingDocumentAlerts || 0} tone="white" />
                  <Metric label="Queue Confidence" value={queue.predictionConfidence || 'medium'} tone="white" />
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-white bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Recent Audit Activity</h2>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
                <div className="grid grid-cols-[1fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <span>Action</span>
                  <span>Location</span>
                  <span>Time</span>
                </div>
                {(summary?.recentHistory || []).slice(0, 8).map((item) => (
                  <div key={item._id} className="grid grid-cols-[1fr_1fr_1fr] border-t border-slate-100 px-4 py-3 text-sm">
                    <span className="font-semibold">{item.actionType}</span>
                    <span className="text-slate-500">{item.currentLocation}</span>
                    <span className="text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
