import { Link } from 'react-router-dom';
import { DEPARTMENTS_BASE } from '../departmentExperience';
import type { MemberStats } from '../../../lib/userRolesUi';

type Props = {
  departmentName: string;
  stats: MemberStats;
};

export function DepartmentUsersHeader({ departmentName, stats }: Props) {
  return (
    <>
      <nav className="inventory-breadcrumb dept-users-breadcrumb" aria-label="Ruta">
        <Link to={DEPARTMENTS_BASE}>Departamentos</Link>
        <span aria-hidden> / </span>
        <span>{departmentName || 'Departamento'}</span>
        <span aria-hidden> / </span>
        <span>Usuarios</span>
      </nav>

      <header className="dept-users-header dept-users-header--compact">
        <div className="dept-users-header__top">
          <h1 className="dept-users-header__title">
            <i className="ti ti-users" aria-hidden="true" /> Usuarios —{' '}
            {departmentName || 'Departamento'}
          </h1>
          <ul className="dept-users-stats" aria-label="Resumen de miembros">
            <li>
              <span className="inventory-badge inventory-badge--neutral">{stats.total}</span>
              <span>Total</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--warning">{stats.deptAdmin}</span>
              <span>Administradores</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--neutral">{stats.supervisor}</span>
              <span>Supervisores</span>
            </li>
            <li>
              <span className="inventory-badge inventory-badge--muted">{stats.tecnico}</span>
              <span>Técnicos</span>
            </li>
          </ul>
          <Link className="inventory-btn inventory-btn--sm dept-users-header__back" to={DEPARTMENTS_BASE}>
            Volver
          </Link>
        </div>
        <p className="dept-users-header__subtitle">
          Roles de área de este departamento. Roles globales en{' '}
          <Link to="/settings?tab=users">Configuración → Usuarios del sistema</Link>.
        </p>
      </header>
    </>
  );
}
