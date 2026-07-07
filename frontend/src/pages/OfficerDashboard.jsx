import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QrScanner from '../components/QrScanner';
import FileActions from '../components/FileActions';
import { api } from '../lib/api';
import { getStoredUser, clearSession } from '../lib/api';

const STATUS_STYLES = {
  Received: 'bg-blue-100 text-blue-800 border-blue-200',
  Pending: 'bg-orange-100 text-orange-800 border-orange-200',
  Approved: 'bg-green-100 text-green-800 border-green-200',
  Dispatched: 'bg-slate-100 text-slate-800 border-slate-200',
  Backtracked: 'bg-red-100 text-red-800 border-red-200',
};

const riskStyles = {
  Low: 'text-green-700 bg-green-50 border-green-200',
  Medium: 'text-orange-700 bg-orange-50 border-orange-200',
  High: 'text-red-700 bg-red-50 border-red-200',
};

function formatMinutes(minutes) {
  if (!minutes) return 'No sample';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function StatCard({ label, value, tone = 'blue', hint }) {
  const tones = {
    blue: 'from-blue-600 to-cyan-500',
    green: 'from-green-600 to-emerald-500',
    orange: 'from-orange-500 to-amber-400',
    red: 'from-red-600 to-rose-500',
    slate: 'from-slate-700 to-slate-500',
  };

  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className={`mb-4 h-1.5 w-16 rounded-full bg-gradient-to-r ${tones[tone]}`} />
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 h-8 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 h-2 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function QueueBar({ item, max }) {
  const width = max ? `${Math.max(8, (item.count / max) * 100)}%` : '8%';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{item._id}</span>
        <span className="text-slate-500 dark:text-slate-400">{item.count} files</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-blue-600" style={{ width }} />
      </div>
    </div>
  );
}

function Timeline({ items = [] }) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700">No movement history yet.</p>;
  }

  return (
    <ol className="relative ml-3 space-y-5 border-l border-blue-200 dark:border-blue-900">
      {items.map((entry) => (
        <li key={entry._id} className="ml-5">
          <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600 dark:border-slate-950" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.actionType}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.currentLocation} · {entry.officerId?.name || 'System'}
              </p>
              {(entry.notes || entry.backtrackReason) && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{entry.backtrackReason || entry.notes}</p>
              )}
            </div>
            <time className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function OfficerDashboard() {
  const user = getStoredUser();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [manualUid, setManualUid] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      setSummary(await api.dashboardSummary());
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        document.getElementById('quick-search')?.focus();
      }
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setScanning(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const lookupFile = useCallback(async (identifier) => {
    setLoading(true);
    setError('');
    setScanning(false);
    try {
      const data = await api.scanFile(identifier);
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const data = await api.searchFiles({ q: query.trim(), limit: 6 });
        setSearchResults(data.files || []);
      } catch {
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const maxQueue = useMemo(
    () => Math.max(...(summary?.departmentQueue || []).map((item) => item.count), 1),
    [summary]
  );

  function handleActionComplete() {
    if (result?.file?.fileUid) lookupFile(result.file.fileUid);
    loadSummary();
  }

  const metrics = summary?.metrics || {};
  const prediction = summary?.queuePrediction || {};

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">TraceGov</p>
              <h1 className="text-xl font-bold">Officer Command Center</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user?.name} · {user?.deskLocation || 'Government Desk'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/ai" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                AI Insights
              </Link>
              {user?.role === 'admin' && (
                <Link to="/admin" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900">
                  Admin
                </Link>
              )}
              <Link to="/register-file" className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
                Register File
              </Link>
              <button
                type="button"
                onClick={() => { clearSession(); window.location.href = '/login'; }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <StatCard label="Today's Files" value={metrics.todaysFiles || 0} tone="blue" hint="New registrations" />
                <StatCard label="Pending Files" value={metrics.pendingFiles || 0} tone="orange" hint="Waiting in department queues" />
                <StatCard label="Approved Files" value={metrics.approvedFiles || 0} tone="green" hint="Cleared by officers" />
                <StatCard label="Backtracked" value={metrics.rejectedFiles || 0} tone="red" hint={`${metrics.backtrackingToday || 0} returned today`} />
                <StatCard label="Avg Processing" value={formatMinutes(metrics.averageProcessingMinutes)} tone="slate" hint="From recent completed files" />
              </>
            )}
          </section>

          {summaryError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{summaryError}</div>
          )}

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">QR Workflow</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Scan, inspect prediction, and move files from one screen.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800"
                >
                  Quick QR Scan
                </button>
              </div>

              <form
                className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"
                onSubmit={(e) => { e.preventDefault(); if (manualUid) lookupFile(manualUid); }}
              >
                <input
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  placeholder="Enter File UID or scan payload"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                />
                <button type="submit" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold dark:border-slate-700">
                  Lookup
                </button>
              </form>

              {scanning && (
                <div className="mt-5">
                  <QrScanner active={scanning} onScan={lookupFile} onError={(msg) => { setError(msg); setScanning(false); }} />
                  <button type="button" onClick={() => setScanning(false)} className="mt-3 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
                    Cancel scan
                  </button>
                </div>
              )}

              {loading && <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-200">Loading file details...</p>}
              {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

              {result?.file && (
                <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                    <p className="font-mono text-xs text-slate-500">{result.file.fileUid}</p>
                    <h3 className="mt-2 text-xl font-bold">{result.file.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{result.file.citizenName} · {result.file.documentType}</p>
                    <span className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[result.file.currentStatus]}`}>
                      {result.file.currentStatus}
                    </span>
                    <div className="mt-5 grid gap-3 text-sm">
                      <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                        <p className="text-slate-500">Current Department</p>
                        <p className="font-semibold">{result.file.currentLocation}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                        <p className="text-slate-500">Current Officer</p>
                        <p className="font-semibold">{result.file.assignedOfficer?.name || user?.name || 'Assigned desk'}</p>
                      </div>
                    </div>
                    {result.auditChainValid === false && (
                      <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">Audit chain integrity warning</p>
                    )}
                  </div>

                  <div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {['Estimated Completion', 'Risk Indicator', 'Missing Documents'].map((label, index) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-xs text-slate-500">{label}</p>
                          <p className="mt-2 text-lg font-bold">
                            {index === 0 && `${prediction.expectedWaitingMinutes || 45}m`}
                            {index === 1 && (result.file.currentStatus === 'Backtracked' ? 'High' : 'Medium')}
                            {index === 2 && (result.file.requiredDocuments?.length || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <FileActions file={result.file} onActionComplete={handleActionComplete} />
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-lg font-bold">Quick Search</h2>
                <input
                  id="quick-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search file, citizen, tracking ID"
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                />
                <div className="mt-4 space-y-2">
                  {searchResults.map((file) => (
                    <button key={file._id} type="button" onClick={() => lookupFile(file.fileUid)} className="w-full rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-blue-950">
                      <p className="text-sm font-semibold">{file.title}</p>
                      <p className="text-xs text-slate-500">{file.fileUid} · {file.currentLocation}</p>
                    </button>
                  ))}
                  {query.length >= 2 && !searchResults.length && <p className="text-sm text-slate-500">No matching active files.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-lg font-bold">AI Suggestions</h2>
                <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                  {summary?.ai?.recommendation || 'AI suggestions will appear after files are processed.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-slate-500">Delay Probability</p>
                    <p className="text-xl font-bold">{summary?.ai?.delayProbability || 0}%</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                    <p className="text-slate-500">Risk Score</p>
                    <p className="text-xl font-bold">{summary?.ai?.riskScore || 0}</p>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold">Department Queue</h2>
              <div className="mt-5 space-y-4">
                {(summary?.departmentQueue || []).map((item) => <QueueBar key={item._id} item={item} max={maxQueue} />)}
                {!summary?.departmentQueue?.length && <p className="text-sm text-slate-500">No active queue data.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold">Recent Activities</h2>
              <div className="mt-5 space-y-3">
                {(summary?.recentFiles || []).slice(0, 6).map((file) => (
                  <button key={file._id} type="button" onClick={() => lookupFile(file.fileUid)} className="w-full rounded-xl border border-slate-100 p-3 text-left hover:border-blue-200 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{file.title}</p>
                        <p className="text-xs text-slate-500">{file.citizenName} · {file.currentLocation}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${riskStyles[file.ai?.risk?.label] || riskStyles.Low}`}>
                        {file.ai?.risk?.label || 'Low'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold">Notifications</h2>
              <div className="mt-5 space-y-3">
                {(summary?.notifications || []).map((note) => (
                  <div key={note.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="text-sm font-semibold">{note.title}</p>
                    <p className="text-xs text-slate-500">{note.message}</p>
                  </div>
                ))}
                {!summary?.notifications?.length && <p className="text-sm text-slate-500">No new notifications.</p>}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Recent Movement History</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Animated timeline style for audit-friendly demonstrations.</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">
                Queue confidence: <strong>{prediction.predictionConfidence || 'medium'}</strong>
              </div>
            </div>
            <div className="mt-5">
              <Timeline items={summary?.recentHistory || []} />
            </div>
          </section>
        </main>
    </div>
  );
}
