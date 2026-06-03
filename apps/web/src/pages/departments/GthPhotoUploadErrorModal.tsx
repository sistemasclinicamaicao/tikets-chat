import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  fullName: string;
  documentId: string | null;
  message: string;
  onClose: () => void;
};

/** Aviso cuando falla la subida de fotografía GTH. */
export function GthPhotoUploadErrorModal({
  open,
  fullName,
  documentId,
  message,
  onClose,
}: Props) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => okRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const docLabel = documentId?.trim() || '—';

  return (
    <div
      className="employee-profile-modal-backdrop gth-photo-upload-error-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="employee-profile-modal inventory-confirm gth-photo-upload-error"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gth-photo-upload-error-title"
        aria-describedby="gth-photo-upload-error-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gth-photo-upload-error__icon-wrap" aria-hidden="true">
          <i className="ti ti-alert-circle gth-photo-upload-error__icon" />
        </div>
        <div className="employee-profile-modal__header gth-photo-upload-error__header">
          <h2 id="gth-photo-upload-error-title" className="employee-profile-modal__title">
            No se pudo subir la fotografía
          </h2>
        </div>
        <div id="gth-photo-upload-error-desc" className="gth-photo-upload-error__body">
          <p className="inventory-confirm__message gth-photo-upload-error__lead">{message}</p>
          <dl className="gth-photo-upload-error__meta">
            <div>
              <dt>Empleado</dt>
              <dd>{fullName}</dd>
            </div>
            <div>
              <dt>Cédula</dt>
              <dd>{docLabel}</dd>
            </div>
          </dl>
        </div>
        <div className="inventory-confirm__actions">
          <button ref={okRef} type="button" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
