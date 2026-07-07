import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import OfficerDashboard from './pages/OfficerDashboard';
import RegisterFilePage from './pages/RegisterFilePage';
import CitizenTrackPage from './pages/CitizenTrackPage';
import AIInsightsDashboard from './pages/AIInsightsDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { getStoredUser } from './lib/api';

function ProtectedRoute({ children, roles }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/track" replace />;
  return children;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('tracegov_dark_mode');
    if (saved) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  useEffect(() => {
    localStorage.setItem('tracegov_dark_mode', String(darkMode));
  }, [darkMode]);

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen bg-ward-cream text-gray-900 transition-colors dark:bg-slate-950 dark:text-slate-100`}>
      <button
        type="button"
        onClick={() => setDarkMode((value) => !value)}
        className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-lg hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {darkMode ? 'Light' : 'Dark'}
      </button>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track" element={<CitizenTrackPage />} />
        <Route
          path="/officer"
          element={
            <ProtectedRoute roles={['officer']}>
              <OfficerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/register-file"
          element={
            <ProtectedRoute roles={['officer', 'admin']}>
              <RegisterFilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai"
          element={
            <ProtectedRoute roles={['officer', 'admin']}>
              <AIInsightsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/track" replace />} />
        <Route path="*" element={<Navigate to="/track" replace />} />
      </Routes>
    </div>
  );
}
