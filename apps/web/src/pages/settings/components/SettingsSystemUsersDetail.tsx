import { Link } from 'react-router-dom';
import { avatarColorFor, initialsFromName } from '../../../components/MessengerLoginAvatar';
import type { AdminUserRow } from '../../../lib/api';
import { globalRoleBadgeVariant, globalRoleLabel } from '../../../lib/userRolesUi';
import { DEPARTMENTS_BASE } from '../../departments/departmentExperience';
import { SettingsUsersToast } from '../SettingsUsersToast';

type Props = {
  selected: AdminUserRow;
  globalRoleDraft: string;
  onGlobalRoleDraftChange: (value: string) => void;
  savingGlobal: boolean;
  onSaveGlobalRole: () => void;
  toastMessage: string;
  toastVariant: 'success' | 'error';
  onDismissToast: () => void;
};

export function SettingsSystemUsersDetail({
  selected,
  globalRoleDraft,
  onGlobalRoleDraftChange,
  savingGlobal,
  onSaveGlobalRole,
  toastMessage,
  toastVariant,
  onDismissToast,
}: Props) {
  const initials = initialsFromName(selected.name);
  const avatarBg = avatarColorFor(selected.employee_id);

  return (
    <div className="settings-system-users__detail-body">
      <header className="settings-system-users__detail-head">
        <span
          className="settings-system-users__avatar"
          style={{ background: avatarBg, color: '#fff' }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="settings-system-users__detail-identity">
          <h3>{selected.name}</h3>
          <p className="settings-muted">{selected.email ?? 'sin correo'}</p>
          <p className="settings-system-users__meta">
            Cédula <strong>{selected.employee_id}</strong>
          </p>
        </div>
        <div className="settings-system-users__detail-badges">
          <span className={`inventory-badge ${globalRoleBadgeVariant(selected.global_role)}`}>
            {globalRoleLabel(selected.global_role)}
          </span>
          <span
            className={`inventory-badge ${
              selected.is_active ? 'inventory-badge--success' : 'inventory-badge--inactive'
            }`}
          >
            {selected.is_active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </header>

      <SettingsUsersToast
        message={toastMessage}
        variant={toastVariant}
        onDismiss={onDismissToast}
      />

      <p className="settings-muted settings-system-users__readonly-note">
        Nombre, correo y estado provienen del directorio GTH (sincronización). Aquí solo se edita el
        rol global de plataforma.
      </p>

      <section className="settings-system-users__role-section">
        <h4>
          <i className="ti ti-shield" aria-hidden="true" /> Rol global (plataforma)
        </h4>
        <p className="settings-muted">
          Acceso a Configuración, auditoría global y administración de toda la plataforma.
        </p>
        <label className="settings-field">
          Rol global
          <select
            className="chat-input"
            value={globalRoleDraft}
            onChange={(e) => onGlobalRoleDraftChange(e.target.value)}
          >
            <option value="">(ninguno)</option>
            <option value="admin">admin</option>
            <option value="auditor">auditor</option>
          </select>
        </label>
        <button
          type="button"
          className="settings-btn"
          disabled={savingGlobal}
          onClick={onSaveGlobalRole}
        >
          {savingGlobal ? 'Guardando…' : 'Guardar rol global'}
        </button>
      </section>

      <p className="settings-muted settings-system-users__dept-note">
        Para técnicos, supervisores o administradores de área, use{' '}
        <Link to={DEPARTMENTS_BASE}>Departamentos → Gestión de usuarios</Link>.
      </p>
    </div>
  );
}
