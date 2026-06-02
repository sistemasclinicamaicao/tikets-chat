import { useEffect, useMemo, useState } from 'react';
import { ApiError, fetchGthComunicacionesRecord, type GthComunicacionesRecordDetail } from '../../lib/api';
import { ClinicaDefaultPhotoImg } from '../../components/ClinicaDefaultPhotoImg';
import { GthComunicacionesRecordPhoto } from '../../components/GthComunicacionesRecordPhoto';
import {
  buildGthRowDetailSections,
  getGthRowValue,
  gthRowDisplayTitle,
  normalizeGthFieldKey,
  resolveGthTableColumns,
  type GthDetailField,
  type GthDetailSection,
} from '../settingsUsersGthFields';

type Props = {
  open: boolean;
  departmentId: string;
  recordId: string | null;
  onClose: () => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function PresentationSection({
  section,
  layout = 'single',
  fullWidth = false,
  grouped = false,
}: {
  section: GthDetailSection;
  layout?: 'single' | 'dual';
  fullWidth?: boolean;
  grouped?: boolean;
}) {
  const fields = section.fields.filter((field) => field.value && field.value !== '—');
  if (fields.length === 0) return null;

  const sectionClass = [
    'gth-presentation-modal__section',
    fullWidth ? 'gth-presentation-modal__section--full' : '',
    grouped ? 'gth-presentation-modal__section--grouped' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (layout === 'dual') {
    const rows: Array<[ (typeof fields)[number], (typeof fields)[number] | null ]> = [];
    for (let i = 0; i < fields.length; i += 2) {
      rows.push([fields[i], fields[i + 1] ?? null]);
    }

    return (
      <section className={sectionClass}>
        <h3 className="gth-presentation-modal__section-title">{section.title}</h3>
        <table className="gth-presentation-modal__table gth-presentation-modal__table--dual">
          <tbody>
            {rows.map(([left, right], index) => (
              <tr key={`${section.title}-${left.label}-${index}`}>
                <th scope="row">{left.label}</th>
                <td title={left.sourceKey ? `Campo API: ${left.sourceKey}` : undefined}>
                  {left.value}
                </td>
                {right ? (
                  <>
                    <th scope="row">{right.label}</th>
                    <td title={right.sourceKey ? `Campo API: ${right.sourceKey}` : undefined}>
                      {right.value}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="gth-presentation-modal__table-spacer" colSpan={2} aria-hidden="true" />
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <h3 className="gth-presentation-modal__section-title">{section.title}</h3>
      <table className="gth-presentation-modal__table">
        <tbody>
          {fields.map((field) => (
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

const HERO_FIELD_KEYS = new Set(['DOC', 'CARGO', 'AREA', 'ESTADO']);

const OTHER_GROUP_ORDER = [
  'Referencias internas',
  'Fechas',
  'Ubicación',
  'Información complementaria',
] as const;

const OTHER_DUPLICATE_KEYS = new Set([
  'DOC',
  'DOCUMENTO',
  'NUMERODOCUMENTO',
  'CEDULA',
  'IDENTIFICACION',
  'CARGO',
  'AREA',
  'DEPENDENCIA',
  'ESTADO',
  'NOMBRECOMPLETO',
  'TIPO',
  'TIPODOCUMENTO',
  'NOMBREDOCUMENTO',
  'EMAIL',
  'CORREO',
  'TELEFONO',
  'TELEFONOS',
  'DIRECCION',
  'CELULCAR',
  'CELULAR',
]);

function isOtherDuplicateField(label: string): boolean {
  const nk = normalizeGthFieldKey(label);
  if (HERO_FIELD_KEYS.has(nk)) return true;
  return OTHER_DUPLICATE_KEYS.has(nk);
}

function classifyOtherField(label: string): (typeof OTHER_GROUP_ORDER)[number] {
  const nk = normalizeGthFieldKey(label);
  if (nk.startsWith('ID') || nk.includes('IDAREA') || nk.includes('IDCARGO') || nk.includes('IDCONTRATO')) {
    return 'Referencias internas';
  }
  if (nk.includes('FECHA')) return 'Fechas';
  if (
    nk.includes('LUGAR') ||
    nk.includes('LOCALIDAD') ||
    nk.includes('BARRIO') ||
    nk.includes('RESIDENCIA') ||
    nk.includes('EXPEDICION')
  ) {
    return 'Ubicación';
  }
  return 'Información complementaria';
}

function splitOtherFieldsSection(section: GthDetailSection): GthDetailSection[] {
  const groups = new Map<string, GthDetailField[]>(
    OTHER_GROUP_ORDER.map((title) => [title, []]),
  );

  for (const field of section.fields) {
    if (isOtherDuplicateField(field.label)) continue;
    const group = classifyOtherField(field.label);
    groups.get(group)?.push(field);
  }

  return OTHER_GROUP_ORDER.map((title) => ({
    title,
    fields: groups.get(title) ?? [],
  })).filter((s) => s.fields.length > 0);
}

function buildOtherTabBlocks(sections: GthDetailSection[]): GthDetailSection[] {
  const blocks: GthDetailSection[] = [];

  for (const section of sections) {
    const fields = section.fields.filter((field) => field.value && field.value !== '—');
    if (fields.length === 0) continue;

    if (section.title === 'Otros campos') {
      blocks.push(...splitOtherFieldsSection({ ...section, fields }));
      continue;
    }

    blocks.push({ ...section, fields });
  }

  return blocks;
}

function OtherFieldsPanel({ sections }: { sections: GthDetailSection[] }) {
  const blocks = buildOtherTabBlocks(sections);
  if (blocks.length === 0) return null;

  return (
    <div className="gth-presentation-modal__other-stack">
      {blocks.map((section) => (
        <PresentationSection
          key={section.title}
          section={section}
          layout={section.title === 'Contrato y compensación' ? 'single' : 'dual'}
          fullWidth
          grouped
        />
      ))}
    </div>
  );
}

const MAIN_SECTION_TITLES = new Set([
  'Identificación',
  'Nombre completo',
  'Datos laborales',
  'Contacto',
  'Datos personales',
  'Seguridad social y prestaciones',
]);

type PresentationTab = 'main' | 'other';

function isHeroField(label: string): boolean {
  return HERO_FIELD_KEYS.has(normalizeGthFieldKey(label));
}

function compactSections(sections: GthDetailSection[]): GthDetailSection[] {
  return sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(
        (field) => field.value && field.value !== '—' && !isHeroField(field.label),
      ),
    }))
    .filter((section) => section.fields.length > 0);
}

function splitSections(sections: GthDetailSection[]): {
  mainSections: GthDetailSection[];
  otherSections: GthDetailSection[];
} {
  const mainSections: GthDetailSection[] = [];
  const otherSections: GthDetailSection[] = [];
  for (const section of sections) {
    if (MAIN_SECTION_TITLES.has(section.title)) {
      mainSections.push(section);
    } else {
      otherSections.push(section);
    }
  }
  return { mainSections, otherSections };
}

export function ComunicacionesGthRecordModal({ open, departmentId, recordId, onClose }: Props) {
  const [detail, setDetail] = useState<GthComunicacionesRecordDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<PresentationTab>('main');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setActiveTab('main');
  }, [open, recordId]);

  useEffect(() => {
    if (!open || !recordId || !departmentId) {
      setDetail(null);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    void fetchGthComunicacionesRecord(departmentId, recordId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'No se pudo cargar el registro');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, departmentId, recordId]);

  const payload = detail?.payload ?? null;
  const sections = useMemo(() => {
    if (!payload) return [];
    const columns = resolveGthTableColumns(undefined, [payload]);
    return compactSections(buildGthRowDetailSections(payload, columns));
  }, [payload]);

  const { mainSections, otherSections } = useMemo(() => splitSections(sections), [sections]);
  const otherTabBlocks = useMemo(() => buildOtherTabBlocks(otherSections), [otherSections]);
  const otherFieldCount = useMemo(
    () => otherTabBlocks.reduce((n, section) => n + section.fields.length, 0),
    [otherTabBlocks],
  );

  if (!open || !recordId) return null;

  const title = payload ? gthRowDisplayTitle(payload) : detail?.full_name ?? 'Empleado GTH';
  const doc = payload ? getGthRowValue(payload, 'DOC') : detail?.document_id ?? '';
  const cargo = detail?.cargo || (payload ? getGthRowValue(payload, 'CARGO') : '');
  const area = detail?.area && detail.area !== '—' ? detail.area : payload ? getGthRowValue(payload, 'AREA') : '';
  const estado = detail?.estado ?? '';
  const fechaIngreso =
    detail?.fecha_ingreso && detail.fecha_ingreso !== '—'
      ? detail.fecha_ingreso
      : payload
        ? getGthRowValue(payload, 'FINGRESO')
        : '';

  return (
    <div
      className="employee-profile-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="employee-profile-modal gth-presentation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gth-presentation-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="employee-profile-modal__header gth-presentation-modal__header">
          <div>
            <p className="gth-presentation-modal__kicker">Carta de presentación</p>
            <h2 id="gth-presentation-title" className="employee-profile-modal__title">
              {loading ? 'Cargando…' : title}
            </h2>
          </div>
          <button
            type="button"
            className="employee-profile-modal__close"
            onClick={onClose}
            aria-label="Cerrar carta de presentación"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="employee-profile-modal__loading gth-presentation-modal__status">Cargando datos…</p>
        ) : error ? (
          <p className="error gth-presentation-modal__status">{error}</p>
        ) : detail ? (
          <>
            <div className="gth-presentation-modal__hero">
              <div className="gth-presentation-modal__photo-wrap">
                {detail.has_photo ? (
                  <GthComunicacionesRecordPhoto
                    departmentId={departmentId}
                    recordId={detail.id}
                    alt={`Fotografía de ${title}`}
                    className="gth-presentation-modal__photo"
                  />
                ) : (
                  <ClinicaDefaultPhotoImg
                    className="gth-presentation-modal__photo clinica-default-photo"
                    alt={`Logo institucional — ${title}`}
                  />
                )}
              </div>
              <dl className="gth-presentation-modal__summary">
                <div className="gth-presentation-modal__summary-row">
                  <dt>Documento</dt>
                  <dd>{doc || detail.document_id || '—'}</dd>
                </div>
                <div className="gth-presentation-modal__summary-row">
                  <dt>Cargo</dt>
                  <dd>{cargo || '—'}</dd>
                </div>
                <div className="gth-presentation-modal__summary-row">
                  <dt>Área</dt>
                  <dd>{area || '—'}</dd>
                </div>
                <div className="gth-presentation-modal__summary-row">
                  <dt>Estado</dt>
                  <dd>{estado || '—'}</dd>
                </div>
                <div className="gth-presentation-modal__summary-row">
                  <dt>F. ingreso</dt>
                  <dd>{fechaIngreso || '—'}</dd>
                </div>
                <div className="gth-presentation-modal__summary-row">
                  <dt>Foto registrada</dt>
                  <dd>{formatDate(detail.photo_uploaded_at)}</dd>
                </div>
              </dl>
            </div>

            <div className="gth-presentation-modal__tabs-wrap">
              <div
                className="settings-tab-row gth-presentation-modal__tabs"
                role="tablist"
                aria-label="Secciones de la carta de presentación"
              >
                <button
                  type="button"
                  role="tab"
                  id="gth-presentation-tab-main"
                  aria-selected={activeTab === 'main'}
                  aria-controls="gth-presentation-panel-main"
                  className={`settings-tab gth-presentation-modal__tab${activeTab === 'main' ? ' settings-tab--active' : ''}`}
                  onClick={() => setActiveTab('main')}
                >
                  Principal
                </button>
                <button
                  type="button"
                  role="tab"
                  id="gth-presentation-tab-other"
                  aria-selected={activeTab === 'other'}
                  aria-controls="gth-presentation-panel-other"
                  className={`settings-tab gth-presentation-modal__tab${activeTab === 'other' ? ' settings-tab--active' : ''}`}
                  onClick={() => setActiveTab('other')}
                  disabled={otherFieldCount === 0}
                >
                  Otros datos
                  {otherFieldCount > 0 ? (
                    <span className="gth-presentation-modal__tab-count">{otherFieldCount}</span>
                  ) : null}
                </button>
              </div>
            </div>

            <div
              className="gth-presentation-modal__body"
              role="tabpanel"
              id={activeTab === 'main' ? 'gth-presentation-panel-main' : 'gth-presentation-panel-other'}
              aria-labelledby={activeTab === 'main' ? 'gth-presentation-tab-main' : 'gth-presentation-tab-other'}
            >
              {activeTab === 'main' ? (
                mainSections.length === 0 ? (
                  <p className="employee-profile-modal__empty">No hay datos principales para mostrar.</p>
                ) : (
                  <div className="gth-presentation-modal__sections-grid">
                    {mainSections.map((section) => (
                      <PresentationSection key={section.title} section={section} />
                    ))}
                  </div>
                )
              ) : otherFieldCount === 0 ? (
                <p className="employee-profile-modal__empty">No hay otros campos para mostrar.</p>
              ) : (
                <OtherFieldsPanel sections={otherSections} />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
