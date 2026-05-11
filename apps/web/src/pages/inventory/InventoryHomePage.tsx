import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  filterDepartmentsForInventory,
  getCurrentUserProfile,
  getTicketDepartments,
  type CurrentUserProfile,
  type TicketDepartmentOption,
} from '../../lib/api';

export function InventoryHomePage() {
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
        <h2 className="inventory-page-title">Inventario y hoja de vida</h2>
        <p className="inventory-breadcrumb">
          Seleccione un área para ver equipos por categoría: PC, impresoras, redes u otros.
        </p>
      </header>
      {error ? (
        <div className="inventory-alert inventory-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {!profile && !error ? <p>Cargando…</p> : null}
      {profile && filtered.length === 0 ? (
        <p>No tiene departamentos asignados con permiso de inventario.</p>
      ) : null}
      {filtered.length > 0 ? (
        <ul className="inventory-dept-grid">
          {filtered.map((d) => (
            <li key={d.id} className="inventory-dept-card">
              <h3 className="inventory-dept-card__name">{d.name}</h3>
              <p className="inventory-dept-card__hint">
                Consulte y actualice la hoja de vida de equipos asignados a esta área.
              </p>
              <div className="inventory-dept-card__actions">
                <Link
                  className="inventory-btn inventory-btn--primary"
                  to={`/inventario/${d.id}/hoja-de-vida/pc/bd-hoja-de-vida`}
                >
                  Abrir hoja de vida
                </Link>
                <Link className="inventory-btn inventory-btn--cta" to={`/inventario/${d.id}/mantenimientos`}>
                  Mantenimientos
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
