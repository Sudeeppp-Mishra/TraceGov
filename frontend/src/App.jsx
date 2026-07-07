import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import OfficerDashboard from './pages/OfficerDashboard';
import RegisterFilePage from './pages/RegisterFilePage';
import CitizenTrackPage from './pages/CitizenTrackPage';
import AIInsightsDashboard from './pages/AIInsightsDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { getStoredUser } from './lib/api';

/**
 * Access guard restricting nested pages to authorized sessions.
 */
function ProtectedRoute({ children, roles }) {
  const user = getStoredUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/track" replace />;
  }
  return children;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('tracegov_dark_mode');
    if (savedMode) return savedMode === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  // Sync class on document element
  useEffect(() => {
    localStorage.setItem('tracegov_dark_mode', String(darkMode));
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors font-sans antialiased">
      
      {/* Floating Theme toggle button */}
      <button
        type="button"
        onClick={() => setDarkMode((prev) => !prev)}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card shadow-lg hover:bg-muted text-foreground transition-all cursor-pointer"
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {darkMode ? (
          // Sun SVG
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
          </svg>
        ) : (
          // Moon SVG
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* Main router maps */}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track" element={<CitizenTrackPage />} />
        
        {/* Officer terminal */}
        <Route
          path="/officer"
          element={
            <ProtectedRoute roles={['officer', 'admin']}>
              <OfficerDashboard />
            </ProtectedRoute>
          }
        />

        {/* File registration panel */}
        <Route
          path="/register-file"
          element={
            <ProtectedRoute roles={['officer', 'admin']}>
              <RegisterFilePage />
            </ProtectedRoute>
          }
        />

        {/* AI congestion insights */}
        <Route
          path="/ai"
          element={
            <ProtectedRoute roles={['officer', 'admin']}>
              <AIInsightsDashboard />
            </ProtectedRoute>
          }
        />

        {/* Admin panel */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* Fallbacks */}
        <Route path="/" element={<Navigate to="/track" replace />} />
        <Route path="*" element={<Navigate to="/track" replace />} />
      </Routes>
    </div>
  );
}
