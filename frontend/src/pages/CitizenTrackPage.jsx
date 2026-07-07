import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STATUS_STYLES = {
  Received: 'bg-blue-100 text-blue-800 border-blue-200',
  Pending: 'bg-orange-100 text-orange-800 border-orange-200',
  Approved: 'bg-green-100 text-green-800 border-green-200',
  Dispatched: 'bg-slate-100 text-slate-800 border-slate-200',
  Backtracked: 'bg-red-100 text-red-800 border-red-200',
};

const STEPS = ['Received', 'Pending', 'Approved', 'Dispatched'];

function friendlyMessage(result, estimate) {
  if (!result) return 'Enter your tracking ID to see the latest status of your government file.';
  if (result.currentStatus === 'Backtracked') return 'Your application needs one correction before it can continue.';
  if (result.currentStatus === 'Dispatched') return 'Your file has completed processing and is ready for collection or dispatch.';
  if (estimate?.estimatedMinutesRemaining) {
    return `Your application is currently under review in ${result.currentLocation}. Estimated completion is about ${estimate.estimatedMinutesRemaining} minutes.`;
  }
  return `Your application is currently under review in ${result.currentLocation}.`;
}

function ProgressRail({ status }) {
  const activeIndex = status === 'Backtracked' ? 1 : Math.max(0, STEPS.indexOf(status));
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {STEPS.map((step, index) => {
        const done = index <= activeIndex && status !== 'Backtracked';
        const active = index === activeIndex || (status === 'Backtracked' && step === 'Pending');
        return (
          <div key={step} className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-green-600 text-white' : active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {index + 1}
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">{step}</p>
            <p className="mt-1 text-xs text-slate-500">{done ? 'Completed' : active ? 'Current step' : 'Remaining'}</p>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ items = [] }) {
  if (!items.length) {
    return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No timeline updates yet.</p>;
  }

  return (
    <ol className="relative ml-3 space-y-6 border-l-2 border-blue-200">
      {items.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} className="ml-6">
          <span className="absolute -left-2 mt-1 h-4 w-4 rounded-full border-4 border-white bg-blue-700" />
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">{entry.status}</p>
                <p className="mt-1 text-sm text-slate-500">{entry.location}</p>
              </div>
              <time className="text-xs font-medium text-slate-400">{new Date(entry.timestamp).toLocaleString()}</time>
            </div>
            {entry.message && <p className="mt-3 text-sm text-slate-600">{entry.message}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LoadingState() {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-2xl bg-white/80" />
      ))}
    </div>
  );
}

export default function CitizenTrackPage() {
  const [trackingId, setTrackingId] = useState('');
  const [result, setResult] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTrack(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEstimate(null);
    try {
      const cleanId = trackingId.trim();
      const [trackData, estimateData] = await Promise.all([
        api.trackCitizen(cleanId),
        api.estimateCompletion(cleanId).catch(() => null),
      ]);
      setResult(trackData);
      setEstimate(estimateData);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const missingHint = useMemo(() => {
    if (!result) return 'No document issue detected yet.';
    if (result.currentStatus === 'Backtracked') return 'Please contact the ward office or check the correction note.';
    return 'No missing document has been reported for this tracking ID.';
  }, [result]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-white/70 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">TraceGov</p>
            <h1 className="text-xl font-bold">Citizen Tracking Dashboard</h1>
          </div>
          <details className="relative">
            <summary className="list-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:border-blue-300 [&::-webkit-details-marker]:hidden">
              Login As
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold shadow-lg">
              <Link to="/login?role=officer" className="block px-4 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                Officer
              </Link>
              <Link to="/login?role=admin" className="block px-4 py-2 text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                Admin
              </Link>
            </div>
          </details>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
          <div>
            <p className="text-sm font-semibold text-blue-700">Simple status for every citizen</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">Track your file without visiting the office.</h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">{friendlyMessage(result, estimate)}</p>
          </div>

          <form onSubmit={handleTrack} className="rounded-2xl border border-white bg-white p-6 shadow-sm">
            <label className="block text-sm font-bold text-slate-800">Tracking ID</label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                placeholder="TGTRACK123"
                required
                className="min-w-0 rounded-xl border border-slate-200 px-4 py-3 font-mono uppercase outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-700 px-6 py-3 font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? 'Checking...' : 'Track'}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Use the tracking ID printed on your file receipt.</p>
          </form>
        </section>

        {loading && <LoadingState />}

        {error && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {result && !loading && (
          <>
            <section className="mt-8 rounded-3xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur">
              <ProgressRail status={result.currentStatus} />
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-white bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-slate-500">{result.trackingId}</p>
                      <h3 className="mt-2 text-2xl font-bold">{result.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{result.documentType} · Ward {result.wardCode}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[result.currentStatus]}`}>
                      {result.currentStatus}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Current Section</p>
                      <p className="mt-1 font-bold">{result.currentLocation}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">Last Updated</p>
                      <p className="mt-1 font-bold">{new Date(result.lastUpdated).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
                  <p className="text-sm font-bold text-blue-800">AI Status Explanation</p>
                  <p className="mt-3 text-blue-950">{friendlyMessage(result, estimate)}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/75 p-4">
                      <p className="text-xs font-semibold text-blue-700">Estimated Completion</p>
                      <p className="mt-1 text-xl font-bold text-blue-950">
                        {estimate?.estimatedMinutesRemaining ? `~${estimate.estimatedMinutesRemaining}m` : 'Updating'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/75 p-4">
                      <p className="text-xs font-semibold text-blue-700">Confidence</p>
                      <p className="mt-1 text-xl font-bold capitalize text-blue-950">{estimate?.confidence || 'medium'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-6 shadow-sm">
                  <p className="text-sm font-bold text-orange-800">Document Check</p>
                  <p className="mt-2 text-sm text-orange-900">{missingHint}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white bg-white/90 p-6 shadow-sm">
                <h3 className="text-xl font-bold">Movement Timeline</h3>
                <p className="mt-1 text-sm text-slate-500">Every public movement update for this file.</p>
                <div className="mt-6">
                  <Timeline items={result.timeline} />
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
