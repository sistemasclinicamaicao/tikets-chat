import { useCallback, useEffect, useRef, useState } from 'react';
import { disconnectRealtime } from '../lib/chatRealtime';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_SETTINGS_TAB,
  isValidSettingsTab,
  SETTINGS_TAB_GROUPS,
} from './settingsNavConfig';
import {
  ApiError,
  canAccessInventoryUi,
  getCurrentUserProfile,
  isGlobalAdminRole,
  isStoredGlobalAdmin,
  persistUserRolesFromProfile,
  type CurrentUserProfile,
} from '../lib/api';

type ProtectedLayoutProps = {
  onLogout: () => void;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function profileFromStorage(): CurrentUserProfile | null {
  const id = localStorage.getItem('user_id');
  const name = localStorage.getItem('user_name');
  if (!id || !name) return null;
  return {
    id,
    employee_id: localStorage.getItem('user_employee_id') ?? '—',
    name,
    email: localStorage.getItem('user_email'),
    phone: null,
    job_title: null,
    dependency_name: null,
    labor_type: null,
    is_active: true,
    global_role: localStorage.getItem('user_global_role') || null,
    department_roles: [],
  };
}

export function ProtectedLayout({ onLogout }: ProtectedLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const userName = localStorage.getItem('user_name') ?? 'Usuario';
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(() => isStoredGlobalAdmin());
  const [showInventoryNav, setShowInventoryNav] = useState(() => canAccessInventoryUi());
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState<CurrentUserProfile | null>(null);
  const [employeeProfileLoading, setEmployeeProfileLoading] = useState(false);
  const [employeeProfileHint, setEmployeeProfileHint] = useState<string | null>(null);
  /** Submenú de Configuración (admin): segundo clic en «Configuración» lo oculta. */
  const [settingsSubnavOpen, setSettingsSubnavOpen] = useState(true);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) return;
    void getCurrentUserProfile()
      .then((profile) => {
        persistUserRolesFromProfile(profile);
        setIsGlobalAdmin(isGlobalAdminRole(profile.global_role));
      })
      .catch(() => {
        setIsGlobalAdmin(isStoredGlobalAdmin());
      });
  }, []);

  useEffect(() => {
    const prev = prevPathRef.current;
    const now = location.pathname;
    const wasOnSettings = prev.startsWith('/settings');
    const isOnSettings = now.startsWith('/settings');
    if (isOnSettings && !wasOnSettings) {
      setSettingsSubnavOpen(true);
    }
    if (!isOnSettings && wasOnSettings) {
      setSettingsSubnavOpen(true);
    }
    prevPathRef.current = now;
  }, [location.pathname]);

  const closeEmployeeModal = useCallback(() => {
    setEmployeeModalOpen(false);
    setEmployeeProfileHint(null);
  }, []);

  useEffect(() => {
    if (!employeeModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeEmployeeModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [employeeModalOpen, closeEmployeeModal]);

  async function openEmployeeModal() {
    setEmployeeModalOpen(true);
    setEmployeeProfileHint(null);
    setEmployeeProfile(profileFromStorage());
    setEmployeeProfileLoading(true);
    try {
      const profile = await getCurrentUserProfile();
      persistUserRolesFromProfile(profile);
      setIsGlobalAdmin(isGlobalAdminRole(profile.global_role));
      setEmployeeProfile(profile);
      localStorage.setItem('user_employee_id', profile.employee_id);
      if (profile.email) localStorage.setItem('user_email', profile.email);
      else localStorage.removeItem('user_email');
    } catch (err) {
      const cached = profileFromStorage();
      setEmployeeProfile(cached);
      if (!cached) {
        setEmployeeProfileHint(
          err instanceof ApiError ? err.message : 'No se pudieron cargar los datos del empleado.',
        );
      } else if (err instanceof ApiError && err.status !== 401) {
        setEmployeeProfileHint('No se pudo actualizar desde el servidor. Mostrando datos guardados.');
      }
    } finally {
      setEmployeeProfileLoading(false);
    }
  }

  const settingsTabParam = searchParams.get('tab');
  const activeSettingsTab = isValidSettingsTab(settingsTabParam) ? settingsTabParam : DEFAULT_SETTINGS_TAB;
  const showSettingsSubnav =
    isGlobalAdmin && location.pathname.startsWith('/settings') && settingsSubnavOpen;

  function logout() {
    disconnectRealtime('ProtectedLayout.logout');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_employee_id');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_global_role');
    localStorage.removeItem('user_department_roles');
    onLogout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="dashboard-shell dashboard-shell--fluid">
      <header className="dashboard-header">
        <div className="dashboard-header__brand">
          <span className="dashboard-header__eyebrow">Mesa de soporte</span>
          <h1 className="dashboard-header__title">Chat Tickets</h1>
          <p className="dashboard-header__subtitle">
            Conversaciones y tickets en tiempo real
          </p>
        </div>
        <div className="dashboard-header__actions">
          <div className="dashboard-header__user">
            <button
              type="button"
              className="dashboard-header__avatar"
              onClick={openEmployeeModal}
              aria-haspopup="dialog"
              aria-expanded={employeeModalOpen}
              aria-controls="employee-profile-dialog"
              title="Ver datos del empleado"
            >
              {getInitials(userName)}
            </button>
            <div className="dashboard-header__user-text">
              <span className="dashboard-header__user-label">Sesión activa</span>
              <span className="dashboard-header__user-name">{userName}</span>
            </div>
          </div>
          <button
            type="button"
            className="dashboard-header__logout"
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <svg
              className="dashboard-header__logout-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </header>

      {employeeModalOpen ? (
        <div
          className="employee-profile-modal-backdrop"
          role="presentation"
          onClick={closeEmployeeModal}
        >
          <div
            id="employee-profile-dialog"
            className="employee-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-profile-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="employee-profile-modal__header">
              <h2 id="employee-profile-title" className="employee-profile-modal__title">
                Datos del empleado
              </h2>
              <button
                type="button"
                className="employee-profile-modal__close"
                onClick={closeEmployeeModal}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            {employeeProfileHint ? (
              <p className="employee-profile-modal__hint">{employeeProfileHint}</p>
            ) : null}
            {employeeProfileLoading && !employeeProfile ? (
              <p className="employee-profile-modal__loading">Cargando…</p>
            ) : employeeProfile ? (
              <dl className="employee-profile-modal__fields">
                <div className="employee-profile-modal__row">
                  <dt>Nombre</dt>
                  <dd>{employeeProfile.name}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>ID empleado</dt>
                  <dd>{employeeProfile.employee_id}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Correo</dt>
                  <dd>{employeeProfile.email ?? '—'}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Teléfono</dt>
                  <dd>{employeeProfile.phone ?? '—'}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Cargo</dt>
                  <dd>{employeeProfile.job_title ?? '—'}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Dependencia</dt>
                  <dd>{employeeProfile.dependency_name ?? '—'}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Tipo labor</dt>
                  <dd>{employeeProfile.labor_type ?? '—'}</dd>
                </div>
                <div className="employee-profile-modal__row">
                  <dt>Estado</dt>
                  <dd>{employeeProfile.is_active ? 'Activo' : 'Inactivo'}</dd>
                </div>
              </dl>
            ) : (
              <p className="employee-profile-modal__empty">No hay datos para mostrar.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="workspace-layout">
        <aside className="workspace-nav-panel">
          <nav className="section-nav section-nav--vertical">
            <Link className={location.pathname === '/' ? 'active' : ''} to="/">
              Inicio
            </Link>
            <Link className={location.pathname.startsWith('/tickets') ? 'active' : ''} to="/tickets">
              Tickets
            </Link>
            <Link
              className={location.pathname.startsWith('/chat') ? 'active' : ''}
              to="/chat"
            >
              Chat
            </Link>
            <Link
              className={location.pathname.startsWith('/settings') ? 'active' : ''}
              to="/settings"
              aria-expanded={isGlobalAdmin && location.pathname.startsWith('/settings') ? settingsSubnavOpen : undefined}
              onClick={(e) => {
                if (!isGlobalAdmin) return;
                if (location.pathname.startsWith('/settings')) {
                  e.preventDefault();
                  setSettingsSubnavOpen((open) => !open);
                }
              }}
            >
              Configuración
            </Link>
            {showSettingsSubnav ? (
              <div className="workspace-settings-subnav" aria-label="Secciones de configuración">
                {SETTINGS_TAB_GROUPS.map((group) => (
                  <div key={group.groupId} className="workspace-settings-subnav__group">
                    <p className="workspace-settings-subnav__label">{group.label}</p>
                    {group.tabs.map(([id, label]) => {
                      const selected = activeSettingsTab === id;
                      return (
                        <Link
                          key={id}
                          id={`settings-nav-${id}`}
                          to={`/settings?tab=${id}`}
                          className={selected ? 'active' : ''}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
            {showInventoryNav ? (
              <Link
                className={location.pathname.startsWith('/inventario') ? 'active' : ''}
                to="/inventario"
              >
                Inventario
              </Link>
            ) : null}
          </nav>
        </aside>
        <section className="workspace-content">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
