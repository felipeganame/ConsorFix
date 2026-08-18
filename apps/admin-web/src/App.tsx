import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell.js';
import { AuthProvider, useAuth } from './lib/auth-ctx.js';
import { AuditPage } from './pages/AuditPage.js';
import { AdministracionesPage } from './pages/AdministracionesPage.js';
import { BandejaPage } from './pages/BandejaPage.js';
import { ConsorciosPage } from './pages/ConsorciosPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MetricsPage } from './pages/MetricsPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { ResidentesPage } from './pages/ResidentesPage.js';
import { TicketDetailPage } from './pages/TicketDetailPage.js';
import { UnidadesPage } from './pages/UnidadesPage.js';

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<BandejaPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="metricas" element={<MetricsPage />} />
          <Route path="consorcios" element={<ConsorciosPage />} />
          <Route path="unidades" element={<UnidadesPage />} />
          <Route path="residentes" element={<ResidentesPage />} />
          <Route path="notificaciones" element={<NotificationsPage />} />
          <Route path="bitacora" element={<AuditPage />} />
          <Route path="administraciones" element={<AdministracionesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
