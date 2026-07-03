import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import QrScanner from '../components/QrScanner';
import FileActions from '../components/FileActions';
import { api } from '../lib/api';
import { getStoredUser, clearSession } from '../lib/api';

const STATUS_COLORS = {
  Received: 'bg-blue-100 text-blue-800',
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Dispatched: 'bg-purple-100 text-purple-800',
  Backtracked: 'bg-red-100 text-red-800',
};

export default function OfficerDashboard() {
  const user = getStoredUser();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [manualUid, setManualUid] = useState('');

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

  function handleScan(decoded) {
    lookupFile(decoded);
  }

  function handleActionComplete() {
    if (result?.file?.fileUid) lookupFile(result.file.fileUid);
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="bg-ward-green text-white px-4 py-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Officer Dashboard</h1>
            <p className="text-sm text-green-100">{user?.name} · {user?.deskLocation}</p>
          </div>
          <button
            type="button"
            onClick={() => { clearSession(); window.location.href = '/login'; }}
            className="text-sm text-green-100 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-8">
        {/* Primary action — Scan QR */}
        {!result && (
          <div className="text-center">
            {!scanning ? (
              <>
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="w-full max-w-md mx-auto py-8 px-6 rounded-3xl bg-ward-green text-white shadow-xl hover:bg-ward-green-light transition-all active:scale-[0.98]"
                >
                  <span className="text-5xl block mb-3">📷</span>
                  <span className="text-2xl font-bold">Scan QR</span>
                  <span className="block text-green-100 text-sm mt-2">Point camera at file QR code</span>
                </button>

                <div className="mt-8 flex items-center gap-3 max-w-md mx-auto">
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-sm text-gray-500">or enter File UID</span>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>

                <form
                  className="mt-4 flex gap-2 max-w-md mx-auto"
                  onSubmit={(e) => { e.preventDefault(); if (manualUid) lookupFile(manualUid); }}
                >
                  <input
                    value={manualUid}
                    onChange={(e) => setManualUid(e.target.value)}
                    placeholder="TG-20260701-AB12CD"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button type="submit" className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm">
                    Lookup
                  </button>
                </form>
              </>
            ) : (
              <div>
                <QrScanner
                  active={scanning}
                  onScan={handleScan}
                  onError={(msg) => { setError(msg); setScanning(false); }}
                />
                <button
                  type="button"
                  onClick={() => setScanning(false)}
                  className="mt-4 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel scan
                </button>
              </div>
            )}
          </div>
        )}

        {loading && (
          <p className="text-center text-gray-500 mt-8">Loading file…</p>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
            {error}
            <button type="button" onClick={() => { setError(''); setResult(null); }} className="block mx-auto mt-2 underline">
              Try again
            </button>
          </div>
        )}

        {result?.file && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => { setResult(null); setScanning(false); }}
              className="text-sm text-ward-green mb-4 hover:underline"
            >
              ← Scan another file
            </button>

            <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-mono">{result.file.fileUid}</p>
                  <h2 className="text-xl font-bold mt-1">{result.file.title}</h2>
                  <p className="text-gray-600 text-sm mt-1">{result.file.citizenName} · {result.file.documentType}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[result.file.currentStatus]}`}>
                  {result.file.currentStatus}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Location</p>
                  <p className="font-medium">{result.file.currentLocation}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500">Ward</p>
                  <p className="font-medium">{result.file.wardCode}</p>
                </div>
              </div>

              {result.auditChainValid === false && (
                <p className="mt-3 text-xs text-red-600 font-medium">⚠ Audit chain integrity warning</p>
              )}

              <FileActions file={result.file} onActionComplete={handleActionComplete} />
            </div>

            {result.recentHistory?.length > 0 && (
              <div className="mt-6 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <h3 className="font-semibold text-sm text-gray-700 mb-3">Recent Movement</h3>
                <ul className="space-y-2">
                  {result.recentHistory.map((h) => (
                    <li key={h._id} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                      <span>
                        <span className="font-medium">{h.actionType}</span>
                        <span className="text-gray-500"> · {h.currentLocation}</span>
                      </span>
                      <span className="text-gray-400 text-xs">
                        {new Date(h.timestamp).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link to="/register-file" className="text-sm text-ward-green hover:underline">
            Register new file →
          </Link>
        </div>
      </main>
    </div>
  );
}
