import { useMemo, useState } from 'react';
import {
  ASSIGNABLE_DEPARTMENT_ROLES,
  formatDepartmentRoleLabel,
  type DepartmentUserMember,
} from '../../../lib/api';
import { formatEmployeeDocumentDisplay } from '../../settingsUsersGthFields';
import { departmentRoleBadgeVariant, departmentRoleLabel } from '../../../lib/userRolesUi';
import { DepartmentUsersToast } from './DepartmentUsersToast';

type Props = {
  members: DepartmentUserMember[];
  loading: boolean;
  rowBusy: string | null;
  confirmRemoveId: string | null;
  toastMessage: string;
  toastVariant: 'success' | 'error';
  onDismissToast: () => void;
  onChangeRole: (member: DepartmentUserMember, role: string) => void;
  onRequestRemove: (member: DepartmentUserMember) => void;
  onConfirmRemove: (member: DepartmentUserMember) => void;
  onCancelRemove: () => void;
  showHead?: boolean;
};

export function DepartmentUsersMembersTable({
  members,
  loading,
  rowBusy,
  confirmRemoveId,
  toastMessage,
  toastVariant,
  onDismissToast,
  onChangeRole,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
  showHead = true,
}: Props) {
  const [filterQ, setFilterQ] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    return members.filter((m) => {
      if (filterRole && m.role !== filterRole) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q) ||
        (m.employee_document_display ?? '').toLowerCase().includes(q)
      );
    });
  }, [members, filterQ, filterRole]);

  return (
    <section className="dept-users-panel dept-users-panel--members">
      {showHead ? (
        <header className="dept-users-panel__head">
          <h2>
            <i className="ti ti-users" aria-hidden="true" /> Miembros del departamento
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
              placeholder="Buscar nombre o documento…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              autoComplete="off"
              aria-label="Filtrar miembros"
            />
          </div>
        </div>
        <label className="dept-users-toolbar__filter">
          <span>Rol</span>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">Todos</option>
            {ASSIGNABLE_DEPARTMENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {formatDepartmentRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`dept-users-table-wrap${loading ? ' dept-users-table-wrap--loading' : ''}`}
      >
        {loading ? (
          <div className="inventory-table-overlay" aria-busy="true" aria-label="Cargando miembros">
            <span className="inventory-spinner" aria-hidden="true" />
            <span className="inventory-table-overlay__text">Cargando…</span>
          </div>
        ) : null}

        {filtered.length === 0 && !loading ? (
          <div className="inventory-empty">
            <p className="inventory-empty__title">
              {members.length === 0
                ? 'No hay miembros en este departamento'
                : 'Ningún miembro coincide con el filtro'}
            </p>
            <p className="inventory-empty__hint">
              {members.length === 0
                ? 'Use la pestaña «Agregar miembro» para buscar y asignar empleados.'
                : 'Pruebe otro texto o quite el filtro de rol.'}
            </p>
          </div>
        ) : (
          <table className="inventory-table dept-users-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DOCUMENTO</th>
                <th>Rol</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => {
                const isBusy = rowBusy === member.user_id;
                const isConfirming = confirmRemoveId === member.user_id;
                return (
                  <tr key={member.user_id} className={isBusy ? 'dept-users-row--busy' : undefined}>
                    <td>{member.name}</td>
                    <td>
                      {formatEmployeeDocumentDisplay(
                        member.employee_id,
                        member.employee_document_display,
                      )}
                    </td>
                    <td>
                      <div className="dept-users-role-cell">
                        <span
                          className={`inventory-badge ${departmentRoleBadgeVariant(member.role)}`}
                        >
                          {departmentRoleLabel(member.role)}
                        </span>
                        <select
                          className="dept-users-role-select"
                          value={member.role}
                          disabled={isBusy}
                          onChange={(e) => onChangeRole(member, e.target.value)}
                          aria-label={`Rol de ${member.name}`}
                        >
                          {ASSIGNABLE_DEPARTMENT_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {formatDepartmentRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`inventory-badge ${
                          member.is_active
                            ? 'inventory-badge--success'
                            : 'inventory-badge--inactive'
                        }`}
                      >
                        {member.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="dept-users-actions-cell">
                      {isConfirming ? (
                        <div className="dept-users-confirm">
                          <span>¿Quitar?</span>
                          <button
                            type="button"
                            className="inventory-btn inventory-btn--danger inventory-btn--sm"
                            disabled={isBusy}
                            onClick={() => onConfirmRemove(member)}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            className="inventory-btn inventory-btn--sm"
                            disabled={isBusy}
                            onClick={onCancelRemove}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="dept-users-icon-btn"
                          disabled={isBusy}
                          onClick={() => onRequestRemove(member)}
                          title={`Quitar a ${member.name}`}
                        >
                          <i className="ti ti-user-minus" aria-hidden="true" />
                          <span>Quitar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="dept-users-footer">
        <span className="settings-muted">
          {filtered.length} de {members.length} miembro{members.length === 1 ? '' : 's'}
        </span>
      </footer>
    </section>
  );
}
