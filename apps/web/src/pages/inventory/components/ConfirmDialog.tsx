import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="employee-profile-modal-backdrop inventory-confirm-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="employee-profile-modal inventory-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inventory-confirm-title"
        aria-describedby="inventory-confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="employee-profile-modal__header">
          <h2 id="inventory-confirm-title" className="employee-profile-modal__title">
            {title}
          </h2>
        </div>
        <p id="inventory-confirm-desc" className="inventory-confirm__message">
          {message}
        </p>
        <div className="inventory-confirm__actions">
          <button ref={cancelRef} type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'inventory-btn-danger' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
