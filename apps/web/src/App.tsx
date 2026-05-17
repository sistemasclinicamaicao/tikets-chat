import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { validateSessionForApp } from './lib/api';
import { clearSessionWallClockExceeded, hasStoredAccessToken } from './lib/authStorage';
import { ChatPage } from './pages/ChatPage';
import { disconnectRealtime, ensureRealtimeConnected } from './lib/chatRealtime';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProtectedLayout } from './pages/ProtectedLayout';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { TicketsPage } from './pages/TicketsPage';
import { InventoryHomePage } from './pages/inventory/InventoryHomePage';
import { InventoryHojaDeVidaPage } from './pages/inventory/InventoryHojaDeVidaPage';
import { InventoryPlaceholderPage } from './pages/inventory/InventoryPlaceholderPage';

function RedirectInventoryPcToBd() {
  const { departmentId } = useParams();
  if (!departmentId) return <Navigate to="/inventario" replace />;
  return <Navigate to={`/inventario/${departmentId}/hoja-de-vida/pc/bd-hoja-de-vida`} replace />;
}

function isAuthenticated() {
  return hasStoredAccessToken();
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  /** Evita montar rutas protegidas (p. ej. Tickets) hasta confirmar el token con el API. */
  const [authValidated, setAuthValidated] = useState(() => !isAuthenticated());
  const authValidateSeqRef = useRef(0);
  /** Tras OTP el perfil ya se validó en LoginPage; no bloquear con pantalla intermedia. */
  const pendingLoginRef = useRef(false);

  useEffect(() => {
    const onStorage = () => setAuthenticated(isAuthenticated());
    const onUnauthorized = () => setAuthenticated(false);
    window.addEventListener('storage', onStorage);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth:unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (authenticated && authValidated) {
      void ensureRealtimeConnected('App.authenticated');
      return;
    }
    disconnectRealtime('App.authenticated.false');
  }, [authenticated, authValidated]);

  useEffect(() => {
    if (!authenticated) {
      setAuthValidated(true);
      return;
    }
    const fromFreshLogin = pendingLoginRef.current;
    pendingLoginRef.current = false;
    const seq = ++authValidateSeqRef.current;
    if (!fromFreshLogin) {
      setAuthValidated(false);
    }
    void validateSessionForApp().finally(() => {
      if (authValidateSeqRef.current !== seq) return;
      if (!hasStoredAccessToken()) {
        setAuthenticated(false);
      }
      setAuthValidated(true);
    });
  }, [authenticated]);

  useEffect(() => {
    function onTokenRefreshed() {
      void ensureRealtimeConnected('App.token-refreshed');
    }
    function onUnauthorized() {
      disconnectRealtime('App.auth.unauthorized');
    }
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
      window.removeEventListener('auth:unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const tick = () => {
      if (clearSessionWallClockExceeded()) {
        setAuthenticated(false);
      }
    };
    const id = window.setInterval(tick, 60_000);
    tick();
    return () => window.clearInterval(id);
  }, [authenticated]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage
            onAuthenticated={() => {
              pendingLoginRef.current = true;
              setAuthenticated(true);
              setAuthValidated(true);
            }}
          />
        }
      />
      <Route
        element={
          !authenticated ? (
            <Navigate to="/login" replace />
          ) : !authValidated ? (
            <div
              style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'system-ui, sans-serif',
                color: '#475569',
              }}
            >
              Validando sesión…
            </div>
          ) : (
            <ProtectedLayout onLogout={() => setAuthenticated(false)} />
          )
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/inventario" element={<InventoryHomePage />} />
        <Route
          path="/inventario/:departmentId/hoja-de-vida/pc/bd-hoja-de-vida"
          element={<InventoryHojaDeVidaPage />}
        />
        <Route path="/inventario/:departmentId/hoja-de-vida/pc" element={<RedirectInventoryPcToBd />} />
        <Route
          path="/inventario/:departmentId/hoja-de-vida/:categorySlug"
          element={<InventoryHojaDeVidaPage />}
        />
        <Route
          path="/inventario/:departmentId/mantenimientos"
          element={
            <InventoryPlaceholderPage
              title="Mantenimientos"
              description="Módulo en preparación. Aquí podrá registrar mantenimientos preventivos y correctivos por equipo."
            />
          }
        />
        <Route
          path="/inventario/:departmentId/dar-bajas"
          element={
            <InventoryPlaceholderPage
              title="Dar bajas"
              description="Módulo en preparación. Aquí podrá gestionar bajas formales de activos."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
