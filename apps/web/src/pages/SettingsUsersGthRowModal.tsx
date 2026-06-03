import { useEffect } from 'react';
import {
  buildGthRowDetailSections,
  formatGthDocumentDisplay,
  getGthRowValue,
  gthRowDisplayTitle,
  type GthDetailSection,
} from './settingsUsersGthFields';

type Props = {
  open: boolean;
  row: Record<string, unknown> | null;
  tableColumns: string[];
  isNew?: boolean;
  onClose: () => void;
};

function GthDetailSectionTable({ section }: { section: GthDetailSection }) {
  return (
    <section className="gth-detail-modal__section">
      <h3 className="gth-detail-modal__section-title">{section.title}</h3>
      <table className="gth-detail-modal__table">
        <tbody>
          {section.fields.map((field) => (
            <tr key={`${section.title}-${field.label}`}>
              <th scope="row">{field.label}</th>
              <td title={field.sourceKey ? `Campo API: ${field.sourceKey}` : undefined}>
                {field.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SettingsUsersGthRowModal({ open, row, tableColumns, isNew, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !row) return null;

  const sections = buildGthRowDetailSections(row, tableColumns);
  const title = gthRowDisplayTitle(row);
  const doc = formatGthDocumentDisplay(row);
  const cargo = getGthRowValue(row, 'CARGO');
  const area = getGthRowValue(row, 'AREA');

  return (
    <div
      className="employee-profile-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="employee-profile-modal gth-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gth-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="employee-profile-modal__header gth-detail-modal__header">
          <div className="gth-detail-modal__title-wrap">
            <h2 id="gth-detail-title" className="employee-profile-modal__title">
              {title}
            </h2>
            <p className="gth-detail-modal__subtitle">
              {doc ? (
                <>
                  <span className="gth-detail-modal__meta-item">
                    <strong>DOCUMENTO</strong> {doc}
                  </span>
                  {cargo ? (
                    <span className="gth-detail-modal__meta-item">
                      <strong>Cargo</strong> {cargo}
                    </span>
                  ) : null}
                  {area ? (
                    <span className="gth-detail-modal__meta-item">
                      <strong>Área</strong> {area}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="gth-detail-modal__meta-item settings-muted">
                  Sin número de documento en el registro
                </span>
              )}
            </p>
            {isNew ? (
              <span className="settings-gth-badge-new gth-detail-modal__badge">Nuevo en última sync</span>
            ) : null}
          </div>
          <button
            type="button"
            className="employee-profile-modal__close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            ×
          </button>
        </div>

        <div className="gth-detail-modal__body">
          {sections.length === 0 ? (
            <p className="employee-profile-modal__empty">No hay campos para mostrar.</p>
          ) : (
            sections.map((section) => (
              <GthDetailSectionTable key={section.title} section={section} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
