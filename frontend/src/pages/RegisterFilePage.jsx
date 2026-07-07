import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function RegisterFilePage() {
  const [form, setForm] = useState({
    title: '',
    citizenName: '',
    citizenPhone: '',
    documentType: '',
    requiredDocuments: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => {
      const value = field === 'citizenPhone'
        ? e.target.value.replace(/\D/g, '').slice(0, 10)
        : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!/^\d{10}$/.test(form.citizenPhone)) {
        throw new Error('Citizen number must be exactly 10 digits');
      }

      const payload = {
        ...form,
        requiredDocuments: form.requiredDocuments
          ? form.requiredDocuments.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      const data = await api.registerFile(payload);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="text-green-600 font-semibold text-lg">File Registered</p>
          <p className="font-mono text-sm mt-2">{result.file.fileUid}</p>
          <p className="text-gray-600 text-sm mt-1">Tracking ID: <strong>{result.file.trackingId}</strong></p>
          {result.file.qrDataUrl && (
            <img src={result.file.qrDataUrl} alt="File QR Code" className="mx-auto mt-4 w-48 h-48" />
          )}
          <p className="text-xs text-gray-500 mt-4">Give the Tracking ID to the citizen for status checks.</p>
          <Link to="/officer" className="inline-block mt-6 text-ward-green font-medium hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto">
        <Link to="/officer" className="text-sm text-ward-green hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-4">Register New File</h1>

        <form onSubmit={handleSubmit} className="mt-6 bg-white rounded-2xl shadow-md p-6 space-y-4">
          {['title', 'citizenName', 'citizenPhone', 'documentType'].map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium capitalize mb-1">
                {field.replace(/([A-Z])/g, ' $1')}
              </label>
              <input
                value={form[field]}
                onChange={update(field)}
                required
                type={field === 'citizenPhone' ? 'tel' : 'text'}
                inputMode={field === 'citizenPhone' ? 'numeric' : undefined}
                pattern={field === 'citizenPhone' ? '[0-9]{10}' : undefined}
                maxLength={field === 'citizenPhone' ? 10 : undefined}
                minLength={field === 'citizenPhone' ? 10 : undefined}
                placeholder={field === 'citizenPhone' ? '10 digit citizen number' : undefined}
                title={field === 'citizenPhone' ? 'Citizen number must be exactly 10 digits' : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">Required Documents (comma-separated)</label>
            <input
              value={form.requiredDocuments}
              onChange={update('requiredDocuments')}
              placeholder="Certificate, Tax Receipt, Citizenship"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-ward-green text-white font-semibold disabled:opacity-50"
          >
            {loading ? 'Registering…' : 'Register & Generate QR'}
          </button>
        </form>
      </div>
    </div>
  );
}
