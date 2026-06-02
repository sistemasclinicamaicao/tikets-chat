import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  clearSession,
  getCurrentUserProfile,
  isGlobalAdminRole,
  isStoredGlobalAdmin,
  formatSessionRoleLabel,
  persistUserRolesFromProfile,
  type CurrentUserProfile,
} from '../lib/api';
import { authGet, authRemove, authSet } from '../lib/authStorage';
import { setupNativePushWhenAuthed } from '../lib/nativePush';
import { ClinicaDefaultPhotoImg } from '../components/ClinicaDefaultPhotoImg';
import { initialsFromName } from '../components/MessengerLoginAvatar';
import { usePresentationAvatarPhoto } from '../hooks/usePresentationAvatarPhoto';

type ProtectedLayoutProps = {
  onLogout: () => void;
};

function isDepartmentsModulePath(pathname: string): boolean {
  return pathname.startsWith('/departamentos') || pathname.startsWith('/inventario');
}

function profileFromStorage(): CurrentUserProfile | null {
  const id = authGet('user_id');
  const name = authGet('user_name');
  if (!id || !name) return null;
  return {
    id,
    employee_id: authGet('user_employee_id') ?? '—',
    name,
    email: authGet('user_email'),
    phone: null,
    job_title: null,
    dependency_name: null,
    labor_type: null,
    is_active: true,
    global_role: authGet('user_global_role') || null,
    department_roles: [],
  };
}

export function ProtectedLayout({ onLogout }: ProtectedLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const userName = authGet('user_name') ?? 'Usuario';
  const userEmployeeId = authGet('user_employee_id') ?? '';
  const [hasPresentationAvatar, setHasPresentationAvatar] = useState<boolean | null>(null);
  const sessionAvatarPhoto = usePresentationAvatarPhoto(userEmployeeId, hasPresentationAvatar);
  const sessionDeviceName = authGet('session_device_name')?.trim() ?? '';
  const [userRoleLabel, setUserRoleLabel] = useState(formatSessionRoleLabel);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(() => isStoredGlobalAdmin());
  const [showInventoryNav, setShowInventoryNav] = useState(() => canAccessInventoryUi());
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeProfile, setEmployeeProfile] = useState<CurrentUserProfile | null>(null);
  const [employeeProfileLoading, setEmployeeProfileLoading] = useState(false);
  const [employeeProfileHint, setEmployeeProfileHint] = useState<string | null>(null);
  /** Submenú de Configuración (admin): segundo clic en «Configuración» lo oculta. */
  const [settingsSubnavOpen, setSettingsSubnavOpen] = useState(true);
  const prevPathRef = useRef(location.pathname);
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  /** En ≤860px: menú lateral en cajón; cabecera del shell oculta en CSS */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileShellNarrow, setMobileShellNarrow] = useState(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 860px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    function sync() {
      const matches = mq.matches;
      setMobileShellNarrow(matches);
      if (!matches) setMobileNavOpen(false);
    }
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Cierra el cajón: devuelve foco al botón Menú para no dejar foco dentro de aria-hidden */
  const closeMobileNav = useCallback((opts?: { blurOnly?: boolean }) => {
    if (opts?.blurOnly) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } else {
      mobileNavToggleRef.current?.focus({ preventScroll: true });
    }
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileShellNarrow || !mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobileNav();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileShellNarrow, mobileNavOpen, closeMobileNav]);

  useLayoutEffect(() => {
    if (!mobileShellNarrow || mobileNavOpen) return;
    const drawer = document.getElementById('workspace-nav-drawer');
    const ae = document.activeElement;
    if (drawer && ae instanceof Node && drawer.contains(ae)) {
      mobileNavToggleRef.current?.focus({ preventScroll: true });
    }
  }, [mobileShellNarrow, mobileNavOpen]);

  useEffect(() => {
    if (!authGet('access_token')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!authGet('access_token')) return;
    setupNativePushWhenAuthed();
  }, []);

  useEffect(() => {
    if (!authGet('access_token')) return;
    void getCurrentUserProfile()
      .then((profile) => {
        persistUserRolesFromProfile(profile);
        setIsGlobalAdmin(isGlobalAdminRole(profile.global_role));
        setUserRoleLabel(formatSessionRoleLabel());
      })
      .catch(() => {
        setIsGlobalAdmin(isStoredGlobalAdmin());
        setUserRoleLabel(formatSessionRoleLabel());
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
      setHasPresentationAvatar(profile.has_presentation_avatar ?? false);
      setEmployeeProfile(profile);
      authSet('user_employee_id', profile.employee_id);
      if (profile.email) authSet('user_email', profile.email);
      else authRemove('user_email');
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
    clearSession();
    onLogout();
    navigate('/login', { replace: true });
  }

  return (
    <main
      id="dashboard-main"
      className={`dashboard-shell dashboard-shell--fluid${
        mobileShellNarrow && mobileNavOpen ? ' dashboard-shell--mobile-drawer-open' : ''
      }`}
    >
      <header className="dashboard-header">
        <div className="dashboard-header__brand">
          <span className="dashboard-header__eyebrow">Mesa de soporte</span>
          <h1 className="dashboard-header__title">Chat Tickets</h1>
          <p className="dashboard-header__subtitle">
            Conversaciones y tickets en tiempo real
          </p>
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
                autoFocus={employeeModalOpen}
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

      {mobileShellNarrow && mobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-drawer-backdrop"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={() => closeMobileNav()}
        />
      ) : null}

      <div className="workspace-layout">
        <aside
          id="workspace-nav-drawer"
          className="workspace-nav-panel"
          aria-hidden={mobileShellNarrow ? !mobileNavOpen : undefined}
        >
          {mobileShellNarrow ? (
            <div className="workspace-mobile-drawer-head">
              <span className="workspace-mobile-drawer-head__title">Menú</span>
              <button
                type="button"
                className="workspace-mobile-drawer-head__close"
                onClick={() => closeMobileNav()}
                aria-label="Cerrar menú"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <nav className="section-nav section-nav--vertical">
            <Link
              className={location.pathname === '/' ? 'active' : ''}
              to="/"
              onClick={() => closeMobileNav()}
            >
              <i className="ti ti-home" aria-hidden="true" />
              <span>Inicio</span>
            </Link>
            <Link
              className={location.pathname.startsWith('/tickets') ? 'active' : ''}
              to="/tickets"
              onClick={() => closeMobileNav()}
            >
              <i className="ti ti-ticket" aria-hidden="true" />
              <span>Tickets</span>
            </Link>
            <Link
              className={location.pathname.startsWith('/chat') ? 'active' : ''}
              to="/chat"
              onClick={() => closeMobileNav()}
            >
              <i className="ti ti-message-circle" aria-hidden="true" />
              <span>Chat</span>
            </Link>
            <Link
              className={location.pathname.startsWith('/settings') ? 'active' : ''}
              to="/settings"
              aria-expanded={isGlobalAdmin && location.pathname.startsWith('/settings') ? settingsSubnavOpen : undefined}
              onClick={(e) => {
                if (!isGlobalAdmin) {
                  closeMobileNav();
                  return;
                }
                if (location.pathname.startsWith('/settings')) {
                  e.preventDefault();
                  setSettingsSubnavOpen((open) => !open);
                } else {
                  closeMobileNav();
                }
              }}
            >
              <i className="ti ti-settings" aria-hidden="true" />
              <span>Configuración</span>
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
                          onClick={() => closeMobileNav()}
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
                className={isDepartmentsModulePath(location.pathname) ? 'active' : ''}
                to="/departamentos"
                onClick={() => closeMobileNav()}
              >
                <i className="ti ti-box" aria-hidden="true" />
                <span>Departamentos</span>
              </Link>
            ) : null}
          </nav>
          <div className="workspace-nav-panel__footer">
            <div className="workspace-nav-panel__session-card">
              <button
                type="button"
                className="workspace-nav-panel__logout-action"
                onClick={() => {
                  closeMobileNav();
                  logout();
                }}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <i className="ti ti-logout" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="workspace-nav-panel__session-profile"
                onClick={() => {
                  closeMobileNav({ blurOnly: true });
                  void openEmployeeModal();
                }}
                aria-haspopup="dialog"
                aria-expanded={employeeModalOpen}
                aria-controls="employee-profile-dialog"
                title="Ver datos del empleado"
              >
              <span className="workspace-nav-panel__avatar-wrap">
                <span
                  className={`workspace-nav-panel__avatar${
                    sessionAvatarPhoto || userEmployeeId
                      ? ' workspace-nav-panel__avatar--photo'
                      : ''
                  }${
                    !sessionAvatarPhoto && userEmployeeId
                      ? ' workspace-nav-panel__avatar--institutional'
                      : ''
                  }`}
                  aria-hidden="true"
                >
                  {sessionAvatarPhoto ? (
                    <img
                      src={sessionAvatarPhoto}
                      alt=""
                      className="workspace-nav-panel__avatar-img"
                    />
                  ) : userEmployeeId ? (
                    <ClinicaDefaultPhotoImg className="workspace-nav-panel__avatar-img workspace-nav-panel__avatar-img--logo" />
                  ) : (
                    initialsFromName(userName)
                  )}
                </span>
                <span
                  className="presence-dot workspace-nav-panel__presence-dot"
                  aria-hidden="true"
                />
              </span>
              <span className="workspace-nav-panel__session-details">
                <span className="workspace-nav-panel__session-label">Sesión activa</span>
                <span className="workspace-nav-panel__session-name" title={userName}>
                  {userName}
                </span>
                <span className="workspace-nav-panel__session-role">{userRoleLabel}</span>
                {sessionDeviceName ? (
                  <span className="workspace-nav-panel__session-device" title="Equipo conectado">
                    <i className="ti ti-device-laptop" aria-hidden="true" />
                    {sessionDeviceName}
                  </span>
                ) : null}
              </span>
            </button>
            </div>
          </div>
        </aside>
        <section className="workspace-content workspace-content--app">
          {mobileShellNarrow ? (
            <div className="workspace-mobile-strip">
              <button
                ref={mobileNavToggleRef}
                type="button"
                className="workspace-mobile-strip__toggle"
                aria-expanded={mobileNavOpen}
                aria-controls="workspace-nav-drawer"
                onClick={() => setMobileNavOpen(true)}
              >
                <i className="ti ti-menu-2" aria-hidden="true" />
                <span>Menú</span>
              </button>
              <span className="workspace-mobile-strip__app-label" aria-hidden>
                {location.pathname.startsWith('/chat')
                  ? 'Chat'
                  : location.pathname.startsWith('/tickets')
                    ? 'Tickets'
                    : location.pathname.startsWith('/settings')
                      ? 'Configuración'
                      : isDepartmentsModulePath(location.pathname)
                        ? 'Departamentos'
                        : 'Inicio'}
              </span>
              <button
                type="button"
                className="workspace-mobile-strip__icon-btn"
                onClick={() => void openEmployeeModal()}
                aria-label="Ver datos del empleado"
                title={userName}
              >
                <i className="ti ti-user" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="workspace-mobile-strip__icon-btn"
                onClick={logout}
                aria-label="Cerrar sesión"
              >
                <i className="ti ti-logout" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <Outlet />
        </section>
      </div>
    </main>
  );
}
