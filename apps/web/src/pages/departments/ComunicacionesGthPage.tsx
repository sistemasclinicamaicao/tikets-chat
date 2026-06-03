import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  fetchGthComunicacionesFilterOptions,
  fetchGthComunicacionesRecords,
  filterDepartmentsForInventory,
  getCurrentUserProfile,
  getTicketDepartments,
  postAdminGthDirectorySync,
  uploadGthComunicacionesPhoto,
  type CurrentUserProfile,
  type GthComunicacionesRecordRow,
  type TicketDepartmentOption,
} from '../../lib/api';
import { ClinicaDefaultPhotoImg } from '../../components/ClinicaDefaultPhotoImg';
import { GthPhotoOnlyModal } from './GthPhotoOnlyModal';
import { GthPhotoUploadErrorModal } from './GthPhotoUploadErrorModal';
import { GthPhotoUploadSuccessModal } from './GthPhotoUploadSuccessModal';
import { GTH_FILTER_FIELDS } from '../settingsUsersGthFields';
import { prepareGthPhotoForUpload } from '../../lib/gthPhotoUpload';
import { DEPARTMENTS_BASE } from './departmentExperience';

const PAGE_SIZE = 25;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type RowUploadProps = {
  departmentId: string;
  row: GthComunicacionesRecordRow;
  onUploaded: (row: GthComunicacionesRecordRow) => void;
};

function RowPhotoUpload({ departmentId, row, onUploaded }: RowUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<GthComunicacionesRecordRow | null>(null);
  const [uploadError, setUploadError] = useState<{ message: string } | null>(null);

  async function onFileChange(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setUploadError(null);
    try {
      const prepared = await prepareGthPhotoForUpload(file);
      const updated = await uploadGthComunicacionesPhoto(departmentId, row.id, prepared);
      onUploaded(updated);
      setUploadSuccess(updated);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'No se pudo subir la fotografía';
      setUploadError({ message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const uploadLabel = row.has_photo ? 'Cambiar fotografía' : 'Subir fotografía';

  return (
    <div className="gth-record-photo-cell">
      {row.has_photo ? (
        <span
          className="gth-onboarding-thumb gth-onboarding-thumb--registered"
          title="Ver fotografía"
          aria-hidden="true"
        >
          <i className="ti ti-user-check" />
        </span>
      ) : (
        <ClinicaDefaultPhotoImg title="Sin fotografía — logo institucional" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        id={`gth-photo-${row.id}`}
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => void onFileChange(e.target.files?.[0])}
      />
      <label
        htmlFor={`gth-photo-${row.id}`}
        className="inventory-icon-btn"
        title={busy ? 'Subiendo…' : uploadLabel}
        aria-label={busy ? 'Subiendo fotografía' : uploadLabel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <i
          className={`ti ${busy ? 'ti-loader' : row.has_photo ? 'ti-photo-edit' : 'ti-upload'}`}
          aria-hidden="true"
        />
      </label>
      <GthPhotoUploadSuccessModal
        open={uploadSuccess !== null}
        fullName={uploadSuccess?.full_name ?? row.full_name}
        documentId={uploadSuccess?.document_id ?? row.document_id}
        uploadedAt={uploadSuccess?.photo_uploaded_at ?? null}
        onClose={() => setUploadSuccess(null)}
      />
      <GthPhotoUploadErrorModal
        open={uploadError !== null}
        fullName={row.full_name}
        documentId={row.document_id}
        message={uploadError?.message ?? ''}
        onClose={() => setUploadError(null)}
      />
    </div>
  );
}

export function ComunicacionesGthPage() {
  const { departmentId = '' } = useParams<{ departmentId: string }>();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [deptList, setDeptList] = useState<TicketDepartmentOption[]>([]);
  const [rows, setRows] = useState<GthComunicacionesRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});
  const [hasPhotoFilter, setHasPhotoFilter] = useState<'all' | 'true' | 'false'>('all');
  const [photoPreview, setPhotoPreview] = useState<{
    recordId: string;
    alt: string;
  } | null>(null);

  const department = useMemo(
    () => deptList.find((d) => d.id === departmentId) ?? null,
    [deptList, departmentId],
  );

  const isAdmin = profile?.global_role === 'admin';

  useEffect(() => {
    void getCurrentUserProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
    void getTicketDepartments()
      .then(setDeptList)
      .catch(() => setDeptList([]));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filters, includeInactive, hasPhotoFilter]);

  const loadFilterOptions = useCallback(async () => {
    if (!departmentId) return;
    try {
      const options = await fetchGthComunicacionesFilterOptions(departmentId, includeInactive);
      setFilterOptions(options);
    } catch {
      setFilterOptions({});
    }
  }, [departmentId, includeInactive]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  const loadRows = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchGthComunicacionesRecords(departmentId, {
        includeInactive,
        q: searchQuery || undefined,
        area: filters.AREA || undefined,
        cargo: filters.CARGO || undefined,
        estado: filters.ESTADO || undefined,
        tipoContrato: filters.TIPOCONTRATO || undefined,
        hasPhoto: hasPhotoFilter,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.data);
      setTotal(result.total);
      setTotalPages(result.total_pages);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el personal GTH');
    } finally {
      setLoading(false);
    }
  }, [departmentId, includeInactive, searchQuery, filters, hasPhotoFilter, page]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const allowedDepts = profile ? filterDepartmentsForInventory(profile, deptList) : [];
  const canAccess = !profile || allowedDepts.some((d) => d.id === departmentId);

  async function onSync() {
    if (!isAdmin || syncing) return;
    setSyncing(true);
    setSyncHint(null);
    setError('');
    try {
      const sync = await postAdminGthDirectorySync();
      if (sync.ok) {
        setSyncHint(
          `${sync.imported} registro(s) importados · ${sync.records_upserted ?? 0} actualizados en Comunicaciones`,
        );
        setPage(1);
        await Promise.all([loadRows(), loadFilterOptions()]);
      } else {
        setError(sync.error ?? 'La sincronización no se completó');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  function onRowUploaded(updated: GthComunicacionesRecordRow) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function openPhotoPreview(record: GthComunicacionesRecordRow) {
    if (!record.has_photo) return;
    setPhotoPreview({ recordId: record.id, alt: `Fotografía de ${record.full_name}` });
  }

  function rowClassName(row: GthComunicacionesRecordRow): string | undefined {
    if (!row.is_active) return 'gth-record-row--inactive';
    return undefined;
  }

  function photoCellClassName(row: GthComunicacionesRecordRow): string {
    return row.has_photo ? 'gth-record-photo-td gth-record-photo-td--viewable' : 'gth-record-photo-td';
  }

  if (!departmentId) {
    return (
      <section className="inventory-page">
        <p>Departamento no especificado.</p>
        <Link to={DEPARTMENTS_BASE}>Volver a departamentos</Link>
      </section>
    );
  }

  if (profile && !canAccess) {
    return (
      <section className="inventory-page">
        <p>No tiene acceso a este departamento.</p>
        <Link to={DEPARTMENTS_BASE}>Volver</Link>
      </section>
    );
  }

  return (
    <section className="inventory-page">
      <nav className="inventory-breadcrumb" aria-label="Ruta">
        <Link to={DEPARTMENTS_BASE}>Departamentos</Link>
        <span aria-hidden> / </span>
        <span>{department?.name ?? 'Comunicaciones'}</span>
        <span aria-hidden> / </span>
        <span>Altas GTH</span>
      </nav>

      <header className="inventory-header">
        <div>
          <h1>Personal GTH — Comunicaciones</h1>
          <p className="inventory-header__subtitle">
            Sincronice el directorio GTH y registre la fotografía de cada empleado activo desde
            esta tabla. También puede sincronizar desde Configuración → Usuarios GTH.
          </p>
        </div>
        <div className="inventory-header__actions">
          {isAdmin ? (
            <button
              type="button"
              className="inventory-btn"
              disabled={syncing || loading}
              onClick={() => void onSync()}
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          ) : null}
          <Link className="inventory-btn" to={DEPARTMENTS_BASE}>
            Volver a departamentos
          </Link>
        </div>
      </header>

      {syncHint ? <p className="inventory-hint">{syncHint}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="gth-records-toolbar inventory-filters">
        <label className="inventory-filter">
          <span>Buscar</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Nombre, cédula, cargo…"
          />
        </label>

        {GTH_FILTER_FIELDS.map((field) => (
          <label key={field} className="inventory-filter inventory-filter--select">
            <span>{field}</span>
            <select
              value={filters[field] ?? ''}
              disabled={loading}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, [field]: e.target.value }))
              }
            >
              <option value="">Todos</option>
              {(filterOptions[field] ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="inventory-filter">
          <span>Fotografía</span>
          <select
            value={hasPhotoFilter}
            onChange={(e) => setHasPhotoFilter(e.target.value as 'all' | 'true' | 'false')}
          >
            <option value="all">Todas</option>
            <option value="true">Con foto</option>
            <option value="false">Sin foto</option>
          </select>
        </label>

        <label className="inventory-filter inventory-filter--checkbox">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>Ver inactivos</span>
        </label>
      </div>

      <p className="inventory-meta">
        {loading ? 'Cargando…' : `${total} registro(s) · página ${page} de ${totalPages}`}
      </p>

      <div className="inventory-table-wrap">
        <table className="inventory-table inventory-table--gth-records">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cédula</th>
              <th>Cargo</th>
              <th>Estado</th>
              <th>Área</th>
              <th>F. ingreso</th>
              <th>Fotografía</th>
              <th>Fecha foto</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  {includeInactive
                    ? 'No hay registros con los filtros aplicados.'
                    : 'No hay empleados activos. Sincronice el directorio GTH o active «Ver inactivos».'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={rowClassName(row)}>
                  <td>{row.full_name}</td>
                  <td>{row.document_id ?? '—'}</td>
                  <td>{row.cargo || '—'}</td>
                  <td>{row.estado}</td>
                  <td>{row.area || '—'}</td>
                  <td>{row.fecha_ingreso || '—'}</td>
                  <td
                    className={photoCellClassName(row)}
                    onClick={() => openPhotoPreview(row)}
                    onKeyDown={(e) => {
                      if (!row.has_photo) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPhotoPreview(row);
                      }
                    }}
                    tabIndex={row.has_photo ? 0 : undefined}
                    role={row.has_photo ? 'button' : undefined}
                    aria-label={
                      row.has_photo ? `Ver fotografía de ${row.full_name}` : undefined
                    }
                  >
                    <RowPhotoUpload
                      departmentId={departmentId}
                      row={row}
                      onUploaded={onRowUploaded}
                    />
                  </td>
                  <td>{row.has_photo ? formatDate(row.photo_uploaded_at) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="inventory-pagination">
          <button
            type="button"
            className="inventory-btn inventory-btn--sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            className="inventory-btn inventory-btn--sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      <GthPhotoOnlyModal
        open={photoPreview !== null}
        departmentId={departmentId}
        recordId={photoPreview?.recordId ?? null}
        alt={photoPreview?.alt ?? 'Fotografía GTH'}
        onClose={() => setPhotoPreview(null)}
        onUnavailable={() => {
          setPhotoPreview(null);
          void loadRows();
        }}
      />
    </section>
  );
}
