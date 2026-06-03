import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  fullName: string;
  documentDisplay: string | null;
  uploadedAt: string | null;
  onClose: () => void;
};

function formatUploadedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Confirmación tras subir fotografía GTH al registro. */
export function GthPhotoUploadSuccessModal({
  open,
  fullName,
  documentDisplay,
  uploadedAt,
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

  const docLabel = documentDisplay?.trim() || '—';

  return (
    <div
      className="employee-profile-modal-backdrop gth-photo-upload-success-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="employee-profile-modal inventory-confirm gth-photo-upload-success"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gth-photo-upload-success-title"
        aria-describedby="gth-photo-upload-success-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gth-photo-upload-success__icon-wrap" aria-hidden="true">
          <i className="ti ti-circle-check gth-photo-upload-success__icon" />
        </div>
        <div className="employee-profile-modal__header gth-photo-upload-success__header">
          <h2 id="gth-photo-upload-success-title" className="employee-profile-modal__title">
            Fotografía guardada
          </h2>
        </div>
        <div id="gth-photo-upload-success-desc" className="gth-photo-upload-success__body">
          <p className="inventory-confirm__message gth-photo-upload-success__lead">
            La fotografía se cargó correctamente en el registro.
          </p>
          <dl className="gth-photo-upload-success__meta">
            <div>
              <dt>Empleado</dt>
              <dd>{fullName}</dd>
            </div>
            <div>
              <dt>DOCUMENTO</dt>
              <dd>{docLabel}</dd>
            </div>
            <div>
              <dt>Fecha de subida</dt>
              <dd>{formatUploadedAt(uploadedAt)}</dd>
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
