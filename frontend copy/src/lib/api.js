const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('tracegov_token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (payload) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  me: () => request('/auth/me'),

  scanFile: (identifier) =>
    request(`/files/scan/${encodeURIComponent(identifier)}`),

  registerFile: (payload) =>
    request('/files/register', { method: 'POST', body: JSON.stringify(payload) }),

  forwardFile: (id, payload) =>
    request(`/files/${id}/forward`, { method: 'POST', body: JSON.stringify(payload) }),

  backtrackFile: (id, payload) =>
    request(`/files/${id}/backtrack`, { method: 'POST', body: JSON.stringify(payload) }),

  searchFiles: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/files/search?${qs}`);
  },

  trackCitizen: (trackingId) => request(`/track/${trackingId}`),

  estimateCompletion: (trackingId) =>
    request('/ai/estimate-completion', {
      method: 'POST',
      body: JSON.stringify({ trackingId }),
    }),
};

export function saveSession(token, user) {
  localStorage.setItem('tracegov_token', token);
  localStorage.setItem('tracegov_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('tracegov_token');
  localStorage.removeItem('tracegov_user');
}

export function getStoredUser() {
  const raw = localStorage.getItem('tracegov_user');
  return raw ? JSON.parse(raw) : null;
}
