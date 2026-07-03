import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const STATUS_COLORS = {
  Received: 'bg-blue-100 text-blue-800',
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Dispatched: 'bg-purple-100 text-purple-800',
  Backtracked: 'bg-red-100 text-red-800',
};

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
      const [trackData, estimateData] = await Promise.all([
        api.trackCitizen(trackingId.trim()),
        api.estimateCompletion(trackingId.trim()).catch(() => null),
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

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ward-green">TraceGov</h1>
          <p className="text-gray-600 mt-1">Track your ward office file</p>
        </div>

        <form onSubmit={handleTrack} className="bg-white rounded-2xl shadow-md p-6">
          <label className="block text-sm font-medium mb-2">Tracking ID</label>
          <div className="flex gap-2">
            <input
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
              placeholder="Enter your tracking ID"
              required
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-ward-green text-white font-medium disabled:opacity-50"
            >
              {loading ? '…' : 'Track'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">You received this ID when your file was registered.</p>
        </form>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold">{result.title}</h2>
                  <p className="text-sm text-gray-600">{result.documentType} · Ward {result.wardCode}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[result.currentStatus]}`}>
                  {result.currentStatus}
                </span>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Current Location</p>
                <p className="font-medium">{result.currentLocation}</p>
              </div>

              {estimate && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800 font-medium">Estimated Completion</p>
                  <p className="text-blue-900">
                    ~{estimate.estimatedMinutesRemaining} minutes
                    <span className="text-sm text-blue-700 ml-1">({estimate.confidence} confidence)</span>
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold mb-4">Status Timeline</h3>
              <ol className="relative border-l-2 border-ward-green/30 ml-2 space-y-4">
                {result.timeline.map((entry, i) => (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[5px] w-2 h-2 rounded-full bg-ward-green" />
                    <p className="font-medium text-sm">{entry.status}</p>
                    <p className="text-xs text-gray-500">{entry.location} · {new Date(entry.timestamp).toLocaleString()}</p>
                    {entry.message && <p className="text-xs text-gray-600 mt-0.5">{entry.message}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        <p className="text-center mt-8 text-sm text-gray-600">
          Officer? <Link to="/login" className="text-ward-green hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
