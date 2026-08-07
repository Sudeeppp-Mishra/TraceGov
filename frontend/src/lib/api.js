const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/**
 * Returns JWT token from sessionStorage.
 */
function getToken() {
  return sessionStorage.getItem('tracegov_token');
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
    if (response.status === 401 && window.location.pathname !== '/login') {
      clearSession();
      // Redirect to login page if user token is invalid or expired
      window.location.href = '/login';
    }
    const errorMsg = data.details && Array.isArray(data.details)
      ? data.details.map((d) => d.message).join(', ')
      : data.error;
    throw new Error(errorMsg || `HTTP error encountered (${response.status})`);
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

  updateOfficer: (id, payload) =>
    request(`/auth/officers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteOfficer: (id) =>
    request(`/auth/officers/${id}`, {
      method: 'DELETE',
    }),


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

  receiveFile: (id, payload = {}) =>
    request(`/files/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resolveMissingDocuments: (id, payload = {}) =>
    request(`/files/${id}/resolve-documents`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Officer-initiated edit of core registration fields on an already-scanned
  // file (typo in phone, wrong document type, missing checklist item, etc.).
  // The backend accepts a partial payload — only the keys you include get
  // applied, and the response includes a `changes[]` diff for the toast.
  editFile: (id, payload = {}) =>
    request(`/files/${id}/details`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getOfficerInbox: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/files/inbox${qs ? `?${qs}` : ''}`);
  },

  getFileSmsLogs: (id) => request(`/files/${id}/sms-logs`),

  // Paginated movement-ledger activity (officers: own actions; admins: whole ward)
  getActivity: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/files/activity${qs ? `?${qs}` : ''}`);
  },

  // --- Departments API ---
  getDepartments: () => request('/departments'),

  createDepartment: (payload) =>
    request('/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDepartment: (id, payload) =>
    request(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Permanently removes a department (backend refuses if files/officers still reference it).
  deleteDepartment: (id) =>
    request(`/departments/${id}`, {
      method: 'DELETE',
    }),

  // --- Citizen Public API ---
  trackCitizen: (trackingId) => request(`/track/${trackingId}`),

  // --- AI Analytics API ---
  // OCR document scan (Nepali + English). Sends a base64 data-URL image plus the
  // required-documents checklist; OCR on CPU is slow, so callers should show a
  // long-running loading state.
  analyzeDocument: (payload) =>
    request('/ai/analyze-document', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reOcrDocument: (fileId, idx, payload) =>
    request(`/files/${fileId}/document-verifications/${idx}/re-ocr`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  estimateCompletion: (trackingId) =>
    request('/ai/estimate-completion', {
      method: 'POST',
      body: JSON.stringify({ trackingId }),
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

  getBottlenecks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/ai/bottlenecks?${qs}`);
  },

  // --- Public Platform Stats API ---
  getPublicStats: () => request('/stats/public'),

  getWeeklyThroughput: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/stats/weekly${qs ? `?${qs}` : ''}`);
  },
};

// --- Session Cache Helpers ---

export function saveSession(token, user) {
  sessionStorage.setItem('tracegov_token', token);
  sessionStorage.setItem('tracegov_user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('tracegov_token');
  sessionStorage.removeItem('tracegov_user');
}

export function getStoredUser() {
  const userJson = sessionStorage.getItem('tracegov_user');
  try {
    return userJson ? JSON.parse(userJson) : null;
  } catch (err) {
    return null;
  }
}