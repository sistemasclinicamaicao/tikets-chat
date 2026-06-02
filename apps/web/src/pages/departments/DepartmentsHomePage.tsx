import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  canManageDepartmentUsers,
  filterDepartmentsForInventory,
  getCurrentUserProfile,
  getTicketDepartments,
  type CurrentUserProfile,
  type TicketDepartmentOption,
} from '../../lib/api';
import {
  departmentCardActions,
  departmentCardHint,
  departmentUsuariosPath,
} from './departmentExperience';

export function DepartmentsHomePage() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [departments, setDepartments] = useState<TicketDepartmentOption[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([getCurrentUserProfile(), getTicketDepartments()])
      .then(([p, d]) => {
        setProfile(p);
        setDepartments(d);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los departamentos'),
      );
  }, []);

  const filtered = profile ? filterDepartmentsForInventory(profile, departments) : [];

  return (
    <section className="module-card inventory-card">
      <header className="inventory-page-header">
        <h2 className="inventory-page-title">Departamentos</h2>
        <p className="inventory-breadcrumb">
          Seleccione un área. Cada departamento tiene su propio módulo según su operación.
        </p>
      </header>
      {error ? (
        <div className="inventory-alert inventory-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {!profile && !error ? <p>Cargando…</p> : null}
      {profile && filtered.length === 0 ? (
        <p>No tiene departamentos asignados con permiso de acceso.</p>
      ) : null}
      {filtered.length > 0 ? (
        <ul className="inventory-dept-grid">
          {filtered.map((d) => {
            const actions = departmentCardActions(d.id, d.name);
            const showUserMgmt = profile ? canManageDepartmentUsers(profile, d.id) : false;
            return (
              <li key={d.id} className="inventory-dept-card">
                <h3 className="inventory-dept-card__name">{d.name}</h3>
                <p className="inventory-dept-card__hint">{departmentCardHint(d.name)}</p>
                <div className="inventory-dept-card__actions">
                  {actions.map((action) => (
                    <Link
                      key={action.to}
                      className={`inventory-btn inventory-btn--${action.variant === 'cta' ? 'cta' : 'primary'}`}
                      to={action.to}
                    >
                      {action.label}
                    </Link>
                  ))}
                  {showUserMgmt ? (
                    <Link
                      className="inventory-btn inventory-btn--cta"
                      to={departmentUsuariosPath(d.id)}
                    >
                      Gestión de usuarios
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
