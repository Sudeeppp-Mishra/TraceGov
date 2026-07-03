import { useState } from 'react';
import { api } from '../lib/api';

const DESKS = ['Reception', 'Verification Desk', 'Tax Desk', 'Approval Desk', 'Dispatch Counter'];

export default function FileActions({ file, onActionComplete }) {
  const [mode, setMode] = useState(null);
  const [nextLocation, setNextLocation] = useState('');
  const [nextStatus, setNextStatus] = useState('Pending');
  const [returnLocation, setReturnLocation] = useState('');
  const [backtrackReason, setBacktrackReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleForward(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.forwardFile(file.id, { nextLocation, nextStatus, notes: `Forwarded to ${nextLocation}` });
      onActionComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBacktrack(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.backtrackFile(file.id, { returnLocation, backtrackReason });
      onActionComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!mode) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <button
          type="button"
          onClick={() => setMode('forward')}
          className="py-4 px-6 rounded-xl bg-ward-green text-white font-semibold text-lg hover:bg-ward-green-light transition-colors"
        >
          Forward →
        </button>
        <button
          type="button"
          onClick={() => setMode('backtrack')}
          className="py-4 px-6 rounded-xl border-2 border-amber-600 text-amber-800 font-semibold text-lg hover:bg-amber-50 transition-colors"
        >
          ← Backtrack
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 p-5 bg-white rounded-xl border border-gray-200">
      <h3 className="font-semibold text-lg mb-4">
        {mode === 'forward' ? 'Forward to Next Desk' : 'Smart Backtracking'}
      </h3>

      {mode === 'forward' ? (
        <form onSubmit={handleForward} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Desk</label>
            <select
              value={nextLocation}
              onChange={(e) => setNextLocation(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Select desk…</option>
              {DESKS.filter((d) => d !== file.currentLocation).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Dispatched">Dispatched</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setMode(null)} className="flex-1 py-2 rounded-lg border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-ward-green text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Processing…' : 'Confirm Forward'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleBacktrack} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Return To</label>
            <select
              value={returnLocation}
              onChange={(e) => setReturnLocation(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Select desk…</option>
              {DESKS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
            <textarea
              value={backtrackReason}
              onChange={(e) => setBacktrackReason(e.target.value)}
              required
              rows={3}
              placeholder="e.g. Missing tax receipt, incomplete form…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setMode(null)} className="flex-1 py-2 rounded-lg border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-amber-600 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Processing…' : 'Confirm Backtrack'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
