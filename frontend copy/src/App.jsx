import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import OfficerDashboard from './pages/OfficerDashboard';
import RegisterFilePage from './pages/RegisterFilePage';
import CitizenTrackPage from './pages/CitizenTrackPage';
import { getStoredUser } from './lib/api';

function ProtectedRoute({ children, roles }) {
  const user = getStoredUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/track" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
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
      <Route path="/" element={<Navigate to="/track" replace />} />
      <Route path="*" element={<Navigate to="/track" replace />} />
    </Routes>
  );
}
