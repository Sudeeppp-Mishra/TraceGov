import React, { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import CitizenTrackPage from './pages/CitizenTrackPage';
import { getStoredUser } from './lib/api';
import { Spinner } from './components/ui';

// Lazy load heavy dashboard and portal components to optimize initial bundle sizes
const LoginPage = lazy(() => import('./pages/LoginPage'));
const OfficerDashboard = lazy(() => import('./pages/OfficerDashboard'));
const OfficerInbox = lazy(() => import('./pages/OfficerInbox'));
const RegisterFilePage = lazy(() => import('./pages/RegisterFilePage'));
const AIInsightsDashboard = lazy(() => import('./pages/AIInsightsDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'));

/** Access guard restricting nested pages to authorized sessions. */
function ProtectedRoute({ children, roles }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/officer'} replace />;
  }
  return children;
}

/** Unknown URLs: staff go back to their workspace, visitors to the landing page. */
function CatchAllRedirect() {
  const user = getStoredUser();
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/officer'} replace />;
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-8 w-8 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground animate-pulse">Loading TraceGov Portal...</p>
          </div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track" element={<CitizenTrackPage />} />
        <Route path="/track/:id" element={<CitizenTrackPage />} />

        <Route
          path="/officer"
          element={
            <ProtectedRoute roles={['officer', 'ward_chair']}>
              <OfficerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute roles={['officer']}>
              <OfficerInbox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/register-file"
          element={
            <ProtectedRoute roles={['officer', 'admin', 'ward_chair']}>
              <RegisterFilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai"
          element={
            <ProtectedRoute roles={['officer', 'ward_chair']}>
              <AIInsightsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/activity"
          element={
            <ProtectedRoute roles={['officer', 'ward_chair']}>
              <ActivityLogPage />
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

        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </Suspense>
  );
}

