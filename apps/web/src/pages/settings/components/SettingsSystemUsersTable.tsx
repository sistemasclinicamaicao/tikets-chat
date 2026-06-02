import type { AdminUserRow } from '../../../lib/api';
import { globalRoleBadgeVariant, globalRoleLabel } from '../../../lib/userRolesUi';
import { selectableRowProps } from '../settingsUtils';

type Props = {
  items: AdminUserRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (user: AdminUserRow) => void;
  filteredTotal: number;
  page: number;
  pageCount: number;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function SettingsSystemUsersTable({
  items,
  loading,
  selectedId,
  onSelect,
  filteredTotal,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
}: Props) {
  return (
    <section className="settings-system-users__panel">
      <div
        className={`settings-system-users__table-wrap${loading ? ' settings-system-users__table-wrap--loading' : ''}`}
      >
        {loading ? (
          <div className="settings-system-users__loading" aria-busy="true">
            <span className="inventory-spinner" aria-hidden="true" />
            <span>Cargando usuarios…</span>
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="inventory-empty">
            <p className="inventory-empty__title">Sin resultados</p>
            <p className="inventory-empty__hint">
              Pruebe otro término o ajuste los filtros de rol o estado.
            </p>
          </div>
        ) : (
          <table className="inventory-table settings-system-users__table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>Correo</th>
                <th>Rol global</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const email = u.email?.trim() ?? '';
                return (
                  <tr
                    key={u.id}
                    {...selectableRowProps(selectedId === u.id, () => onSelect(u))}
                  >
                    <td>{u.name}</td>
                    <td>{u.employee_id}</td>
                    <td className="settings-system-users__email-cell" title={email || undefined}>
                      {email || '—'}
                    </td>
                    <td>
                      <span
                        className={`inventory-badge ${globalRoleBadgeVariant(u.global_role)}`}
                      >
                        {globalRoleLabel(u.global_role)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inventory-badge ${
                          u.is_active ? 'inventory-badge--success' : 'inventory-badge--inactive'
                        }`}
                      >
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="settings-system-users__footer">
        <span className="settings-muted">
          {filteredTotal} coincidencia{filteredTotal === 1 ? '' : 's'} · Página {page} de{' '}
          {pageCount}
        </span>
        <div className="settings-system-users__pagination-actions">
          <button
            type="button"
            className="settings-btn settings-btn--small"
            onClick={onPrevPage}
            disabled={page <= 1 || loading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--small"
            onClick={onNextPage}
            disabled={loading || page >= pageCount}
          >
            Siguiente
          </button>
        </div>
      </footer>
    </section>
  );
}
