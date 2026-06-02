import { useEffect } from 'react';
import type { AdminUserRow } from '../../../lib/api';
import { SettingsSystemUsersDetail } from './SettingsSystemUsersDetail';

type Props = {
  selected: AdminUserRow | null;
  globalRoleDraft: string;
  onGlobalRoleDraftChange: (value: string) => void;
  savingGlobal: boolean;
  onSaveGlobalRole: () => void;
  toastMessage: string;
  toastVariant: 'success' | 'error';
  onDismissToast: () => void;
  onClose: () => void;
};

export function SettingsSystemUsersModal({
  selected,
  globalRoleDraft,
  onGlobalRoleDraftChange,
  savingGlobal,
  onSaveGlobalRole,
  toastMessage,
  toastVariant,
  onDismissToast,
  onClose,
}: Props) {
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  if (!selected) return null;

  return (
    <div
      className="employee-profile-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="employee-profile-modal settings-system-users-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-user-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="employee-profile-modal__header settings-system-users-modal__header">
          <h2 id="system-user-modal-title" className="employee-profile-modal__title">
            Usuario del sistema
          </h2>
          <button
            type="button"
            className="employee-profile-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="settings-system-users-modal__body">
          <SettingsSystemUsersDetail
            selected={selected}
            globalRoleDraft={globalRoleDraft}
            onGlobalRoleDraftChange={onGlobalRoleDraftChange}
            savingGlobal={savingGlobal}
            onSaveGlobalRole={onSaveGlobalRole}
            toastMessage={toastMessage}
            toastVariant={toastVariant}
            onDismissToast={onDismissToast}
          />
        </div>
      </div>
    </div>
  );
}
