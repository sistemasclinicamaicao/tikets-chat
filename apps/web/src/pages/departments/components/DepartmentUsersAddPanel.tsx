import {
  ASSIGNABLE_DEPARTMENT_ROLES,
  formatDepartmentRoleLabel,
  type DepartmentUserSearchHit,
} from '../../../lib/api';
import { departmentRoleLabel } from '../../../lib/userRolesUi';
import { DepartmentUsersToast } from './DepartmentUsersToast';

type Props = {
  searchQ: string;
  onSearchChange: (value: string) => void;
  addRole: string;
  onAddRoleChange: (value: string) => void;
  searchBusy: boolean;
  searchDone: boolean;
  searchHits: DepartmentUserSearchHit[];
  rowBusy: string | null;
  toastMessage: string;
  toastVariant: 'success' | 'error';
  onDismissToast: () => void;
  onAddUser: (hit: DepartmentUserSearchHit) => void;
  showHead?: boolean;
};

export function DepartmentUsersAddPanel({
  searchQ,
  onSearchChange,
  addRole,
  onAddRoleChange,
  searchBusy,
  searchDone,
  searchHits,
  rowBusy,
  toastMessage,
  toastVariant,
  onDismissToast,
  onAddUser,
  showHead = true,
}: Props) {
  const hint =
    searchBusy
      ? 'Buscando coincidencias…'
      : searchQ.trim().length < 2
        ? 'Escriba al menos 2 letras o dígitos; las coincidencias aparecen automáticamente.'
        : searchDone && searchHits.length === 0
          ? 'Ningún usuario coincide con esa búsqueda.'
          : searchHits.length > 0
            ? `${searchHits.length} coincidencia${searchHits.length === 1 ? '' : 's'}.`
            : null;

  return (
    <section className="dept-users-panel">
      {showHead ? (
        <header className="dept-users-panel__head">
          <h2>
            <i className="ti ti-user-plus" aria-hidden="true" /> Agregar miembro
          </h2>
        </header>
      ) : null}

      <DepartmentUsersToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={onDismissToast}
      />

      <div className="dept-users-toolbar">
        <div className="dept-users-toolbar__search">
          <div className="inventory-toolbar__search-wrap">
            <span className="inventory-toolbar__search-icon" aria-hidden>
              <i className="ti ti-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              className="inventory-toolbar__search"
              placeholder="Buscar nombre o cédula…"
              value={searchQ}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              aria-describedby="dept-users-search-hint"
              aria-label="Buscar empleado"
            />
          </div>
        </div>
        <label className="dept-users-toolbar__filter">
          <span>Rol a asignar</span>
          <select value={addRole} onChange={(e) => onAddRoleChange(e.target.value)}>
            {ASSIGNABLE_DEPARTMENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {formatDepartmentRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p id="dept-users-search-hint" className="dept-users-panel__hint">
        {hint}
      </p>

      <div className="dept-users-results-scroll">
        {searchBusy ? (
          <div className="dept-users-results-empty" aria-busy="true">
            <span className="inventory-spinner" aria-hidden="true" />
            <span>Buscando…</span>
          </div>
        ) : searchHits.length > 0 ? (
          <table className="inventory-table dept-users-results-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>En el dept.</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {searchHits.map((hit) => (
                <tr key={hit.user_id} className={rowBusy === hit.user_id ? 'dept-users-row--busy' : undefined}>
                  <td>{hit.name}</td>
                  <td>{hit.employee_id}</td>
                  <td>
                    {hit.in_department ? (
                      <span className="inventory-badge inventory-badge--success">
                        {departmentRoleLabel(hit.current_role ?? '')}
                      </span>
                    ) : (
                      <span className="inventory-badge inventory-badge--muted">No asignado</span>
                    )}
                  </td>
                  <td className="dept-users-actions-cell">
                    <button
                      type="button"
                      className="inventory-btn inventory-btn--cta inventory-btn--sm"
                      disabled={rowBusy === hit.user_id}
                      onClick={() => onAddUser(hit)}
                    >
                      {hit.in_department ? 'Actualizar rol' : 'Agregar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : searchDone && searchQ.trim().length >= 2 ? (
          <div className="dept-users-results-empty">
            <i className="ti ti-users-minus" aria-hidden="true" />
            <span>Sin coincidencias</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
