// Routes: guards the app behind the login screen and mounts the shell layout.
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner, ErrorState } from './components/ui';
import { useQuery } from './api/hooks';
import { DashboardSummary } from './types';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';

const Resources = lazy(() => import('./pages/Resources'));
const Containers = lazy(() => import('./pages/Containers'));
const Kubernetes = lazy(() => import('./pages/Kubernetes'));
const Deployments = lazy(() => import('./pages/Deployments'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const Logs = lazy(() => import('./pages/Logs'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Incidents = lazy(() => import('./pages/Incidents'));
const Costs = lazy(() => import('./pages/Costs'));
const Reports = lazy(() => import('./pages/Reports'));
const Cicd = lazy(() => import('./pages/Cicd'));
const Aws = lazy(() => import('./pages/Aws'));
const Health = lazy(() => import('./pages/Health'));
const Users = lazy(() => import('./pages/Users'));
const Profile = lazy(() => import('./pages/Profile'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-block" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span className="small muted">Loading session…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Open alert/incident counts drive the sidebar badges. */
function useOpenCounts(enabled: boolean) {
  const { data } = useQuery<DashboardSummary>('/api/dashboard/summary', {
    enabled,
    intervalMs: 30_000,
  });
  return { alerts: data?.alerts.open ?? 0, incidents: data?.incidents.open ?? 0 };
}

export default function App() {
  const { user, loading } = useAuth();
  const counts = useOpenCounts(Boolean(user));

  if (loading) {
    return (
      <div className="loading-block" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span className="small muted">Loading session…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <RequireAuth>
      <Layout badges={counts}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/resources/:id" element={<Resources />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/kubernetes" element={<Kubernetes />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/cicd" element={<Cicd />} />
            <Route path="/aws" element={<Aws />} />
            <Route path="/health" element={<Health />} />
            <Route path="/users" element={<Users />} />
            <Route
              path="*"
              element={<ErrorState message="Page not found. Use the sidebar to navigate." />}
            />
          </Routes>
        </Suspense>
      </Layout>
    </RequireAuth>
  );
}
