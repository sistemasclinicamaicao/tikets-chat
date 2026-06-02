import { useEffect, useState } from 'react';
import { ApiError, fetchGthComunicacionesPhotoBlob } from '../../lib/api';

type Props = {
  open: boolean;
  departmentId: string;
  recordId: string | null;
  alt: string;
  onClose: () => void;
  onUnavailable?: () => void;
};

/** Vista ampliada: solo fotografía (sin datos del empleado). */
export function GthPhotoOnlyModal({
  open,
  departmentId,
  recordId,
  alt,
  onClose,
  onUnavailable,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !recordId || !departmentId) {
      setSrc(null);
      setError('');
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError('');
    setSrc(null);

    void fetchGthComunicacionesPhotoBlob(departmentId, recordId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob.size) {
          setError('No hay fotografía registrada para este empleado.');
          onUnavailable?.();
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? e.message
            : 'No se pudo cargar la fotografía. Compruebe que el servidor esté en ejecución.';
        setError(msg);
        onUnavailable?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, departmentId, recordId, onUnavailable]);

  if (!open || !recordId) return null;

  return (
    <div
      className="employee-profile-modal-backdrop gth-photo-only-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="gth-photo-only-modal"
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="employee-profile-modal__close gth-photo-only-modal__close"
          onClick={onClose}
          aria-label="Cerrar fotografía"
        >
          ×
        </button>
        <div className="gth-photo-only-modal__frame">
          {loading ? (
            <p className="gth-photo-only-modal__status">
              <i className="ti ti-loader" aria-hidden="true" /> Cargando…
            </p>
          ) : error ? (
            <p className="gth-photo-only-modal__status gth-photo-only-modal__status--error">{error}</p>
          ) : src ? (
            <img src={src} alt={alt} className="gth-photo-only-modal__img" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
