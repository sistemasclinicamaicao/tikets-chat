import { Link } from 'react-router-dom';
import type { AdminUsersSummary } from '../../../lib/api';
import { DEPARTMENTS_BASE } from '../../departments/departmentExperience';

type Props = {
  summary: AdminUsersSummary | null;
};

export function SettingsSystemUsersHeader({ summary }: Props) {
  return (
    <header className="settings-system-users__header settings-system-users__header--compact">
      <div className="settings-system-users__header-top">
        <h2 className="settings-system-users__title">
          <i className="ti ti-users" aria-hidden="true" /> Usuarios del sistema
        </h2>
        {summary ? (
          <ul className="settings-system-users__stats" aria-label="Resumen de usuarios">
            <li>
              <span className="inventory-badge inventory-badge--neutral">{summary.total}</span>
              <span>Total</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--warning">{summary.admin}</span>
              <span>Administradores</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--neutral">{summary.auditor}</span>
              <span>Auditores</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--muted">
                {summary.without_global_role}
              </span>
              <span>Sin rol global</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--inactive">{summary.inactive}</span>
              <span>Inactivos</span>
            </li>
          </ul>
        ) : null}
      </div>
      <p className="settings-system-users__subtitle">
        El inicio de sesión (OTP) solo admite documentos registrados en esta tabla. Los datos de nombre y correo se
        actualizan al sincronizar GTH en{' '}
        <Link to="/settings?tab=users&amp;users_sub=gth">Configuración → GTH</Link>. Roles por
        departamento en <Link to={DEPARTMENTS_BASE}>Departamentos → Gestión de usuarios</Link>.
      </p>
    </header>
  );
}
