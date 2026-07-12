import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import OfficerDashboard from './pages/OfficerDashboard';
import RegisterFilePage from './pages/RegisterFilePage';
import CitizenTrackPage from './pages/CitizenTrackPage';
import AIInsightsDashboard from './pages/AIInsightsDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { getStoredUser } from './lib/api';

/** Access guard restricting nested pages to authorized sessions. */
function ProtectedRoute({ children, roles }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/officer" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track" element={<CitizenTrackPage />} />

      <Route
        path="/officer"
        element={
          <ProtectedRoute roles={['officer', 'admin']}>
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
