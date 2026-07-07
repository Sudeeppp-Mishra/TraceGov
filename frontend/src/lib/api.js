const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/**
 * Returns JWT token from localStorage.
 */
function getToken() {
  return localStorage.getItem('tracegov_token');
}

/**
 * Common request wrapper executing fetches with JSON formatting and Auth headers.
 */
async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error encountered (${response.status})`);
  }

  return data;
}

export const api = {
  // --- Auth API ---
  login: (email, password, role) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    }),

  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request('/auth/me'),

  getOfficers: () => request('/auth/officers'),

  // --- Files API ---
  registerFile: (payload) =>
    request('/files/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchFiles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/files/search?${qs}`);
  },

  dashboardSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/files/dashboard/summary?${qs}`);
  },

  scanFile: (identifier) =>
    request(`/files/scan/${encodeURIComponent(identifier)}`),

  forwardFile: (id, payload) =>
    request(`/files/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  backtrackFile: (id, payload) =>
    request(`/files/${id}/backtrack`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- Citizen Public API ---
  trackCitizen: (trackingId) => request(`/track/${trackingId}`),

  // --- AI Analytics API ---
  estimateCompletion: (trackingId) =>
    request('/ai/estimate-completion', {
      method: 'POST',
      body: JSON.stringify({ trackingId }),
    }),

  analyzeDocument: (payload) =>
    request('/ai/analyze-document', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  predictDelay: (payload) =>
    request('/ai/predict-delay', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  smartBacktrack: (payload) =>
    request('/ai/smart-backtrack', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  citizenMessage: (payload) =>
    request('/ai/citizen-message', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getBottlenecks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/ai/bottlenecks?${qs}`);
  },
};

// --- Session Cache Helpers ---

export function saveSession(token, user) {
  localStorage.setItem('tracegov_token', token);
  localStorage.setItem('tracegov_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('tracegov_token');
  localStorage.removeItem('tracegov_user');
}

export function getStoredUser() {
  const userJson = localStorage.getItem('tracegov_user');
  try {
    return userJson ? JSON.parse(userJson) : null;
  } catch (err) {
    return null;
  }
}
