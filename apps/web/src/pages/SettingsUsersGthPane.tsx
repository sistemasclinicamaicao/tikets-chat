import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminGetGthDirectory,
  ApiError,
  postAdminGthDirectorySync,
  type AdminGthDirectoryResponse,
  type AdminGthLastSyncAdditions,
} from '../lib/api';
import {
  GTH_FILTER_FIELDS,
  getGthRowValue,
  gthRowSearchText,
  gthRowStableExternalKey,
  gthTableCellText,
  gthTableColumnLabel,
  normalizeGthDocumentId,
  pickGthRowDocumentId,
  resolveGthCellValue,
  resolveGthTableColumns,
} from './settingsUsersGthFields';
import { SettingsUsersGthRowModal } from './SettingsUsersGthRowModal';

const PAGE_SIZE = 25;
const CELL_PREVIEW_LEN = 48;
const PREVIEW_NEW_IDS = 12;

function cellDisplay(full: string): { text: string; title?: string } {
  const t = full.trim();
  if (!t) return { text: '' };
  if (t.length <= CELL_PREVIEW_LEN) return { text: t };
  return { text: `${t.slice(0, CELL_PREVIEW_LEN)}…`, title: t };
}

function buildNewRowMatchers(lastSync: AdminGthLastSyncAdditions | null | undefined) {
  const docIds = new Set(
    (lastSync?.new_document_ids ?? []).map((id) => normalizeGthDocumentId(id)),
  );
  const externalKeys = new Set(lastSync?.new_external_row_keys ?? []);
  return { docIds, externalKeys };
}

function isRowNewInLastSync(
  row: Record<string, unknown>,
  rowIndex: number,
  matchers: { docIds: Set<string>; externalKeys: Set<string> },
): boolean {
  const doc = pickGthRowDocumentId(row);
  if (doc && matchers.docIds.has(doc)) return true;
  if (matchers.externalKeys.size === 0) return false;
  return matchers.externalKeys.has(gthRowStableExternalKey(row, rowIndex));
}

function formatSyncSummary(sync: {
  ok: boolean;
  imported: number;
  added: number;
  removed: number;
  added_document_ids: string[];
  added_without_document: number;
  records_upserted?: number;
  users_created?: number;
  users_updated?: number;
  users_skipped?: number;
  error?: string;
}): string {
  if (!sync.ok) return sync.error ?? 'La sincronización con CONEXION-GTH no se completó.';
  const parts = [
    `${sync.imported} registro(s) en directorio`,
    `${sync.added} nuevo(s)`,
    `${sync.removed} dado(s) de baja`,
  ];
  if (typeof sync.users_created === 'number' || typeof sync.users_updated === 'number') {
    parts.push(
      `usuarios login: ${sync.users_created ?? 0} creado(s), ${sync.users_updated ?? 0} actualizado(s)`,
    );
    if (sync.users_skipped) parts.push(`${sync.users_skipped} sin documento en GTH`);
  }
  if (typeof sync.records_upserted === 'number') {
    parts.push(`${sync.records_upserted} en Comunicaciones`);
  }
  if (sync.added_without_document > 0) {
    parts.push(`${sync.added_without_document} sin documento`);
  }
  const ids = sync.added_document_ids.slice(0, PREVIEW_NEW_IDS);
  if (ids.length > 0) {
    const more = sync.added_document_ids.length - ids.length;
    const list = ids.join(', ');
    parts.push(
      more > 0 ? `documentos nuevos: ${list} (+${more} más)` : `documentos nuevos: ${list}`,
    );
  }
  return parts.join(' · ');
}

export function SettingsUsersGthPane() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdminGthDirectoryResponse | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [onlyNewLastSync, setOnlyNewLastSync] = useState(false);
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<{
    row: Record<string, unknown>;
    sourceIndex: number;
    isNew: boolean;
  } | null>(null);

  const loadFromDb = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGetGthDirectory({ lastSyncAdditions: true });
      setPayload(data);
    } catch (e) {
      setPayload(null);
      const base = e instanceof ApiError ? e.message : 'No se pudo cargar el directorio GTH.';
      const hint =
        e instanceof ApiError && e.status === 404
          ? ' Ejecute la migración Prisma (gth_sync_tracking) y reinicie el API.'
          : '';
      setError(base + hint);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFromApi = useCallback(async () => {
    if (loading || syncing) return;
    setSyncing(true);
    setError(null);
    setSyncHint(null);
    let syncMessage: string | null = null;
    try {
      const sync = await postAdminGthDirectorySync();
      syncMessage = formatSyncSummary(sync);
      if (sync.ok && sync.added > 0) {
        setOnlyNewLastSync(true);
      }
    } catch (e) {
      syncMessage = e instanceof ApiError ? e.message : 'Error al sincronizar con el API externo.';
    }
    try {
      const data = await adminGetGthDirectory({ lastSyncAdditions: true });
      setPayload(data);
      setSyncHint(syncMessage);
    } catch (e) {
      const base = e instanceof ApiError ? e.message : 'No se pudo leer la tabla interna tras sincronizar.';
      setError(syncMessage ? `${syncMessage} ${base}` : base);
      setPayload(null);
    } finally {
      setSyncing(false);
    }
  }, [loading, syncing]);

  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filters, onlyNewLastSync]);

  const allRows = payload?.rows ?? [];
  const lastSyncAdditions = payload?.last_sync_additions ?? null;
  const newRowMatchers = useMemo(
    () => buildNewRowMatchers(lastSyncAdditions),
    [lastSyncAdditions],
  );

  const tableColumns = useMemo(
    () => resolveGthTableColumns(payload?.available_fields, allRows),
    [payload?.available_fields, allRows],
  );

  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const field of GTH_FILTER_FIELDS) {
      const set = new Set<string>();
      for (const row of allRows) {
        const v = getGthRowValue(row, field);
        if (v) set.add(v);
      }
      out[field] = [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }
    return out;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const out: { row: Record<string, unknown>; sourceIndex: number }[] = [];
    allRows.forEach((row, sourceIndex) => {
      if (onlyNewLastSync && !isRowNewInLastSync(row, sourceIndex, newRowMatchers)) {
        return;
      }
      for (const field of GTH_FILTER_FIELDS) {
        const selected = filters[field];
        if (selected && getGthRowValue(row, field) !== selected) return;
      }
      if (searchQuery && !gthRowSearchText(row).includes(searchQuery)) return;
      out.push({ row, sourceIndex });
    });
    return out;
  }, [allRows, filters, searchQuery, onlyNewLastSync, newRowMatchers]);

  const newRowsCount = useMemo(() => {
    if (!lastSyncAdditions) return 0;
    return lastSyncAdditions.added_count;
  }, [lastSyncAdditions]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const hasActiveFilters =
    searchQuery.length > 0 ||
    Object.values(filters).some((v) => v.trim() !== '') ||
    onlyNewLastSync;

  function clearFilters() {
    setSearchInput('');
    setSearchQuery('');
    setFilters({});
    setOnlyNewLastSync(false);
  }

  const storedTotal = payload?.total_stored ?? payload?.total ?? 0;
  const metaLine =
    payload && !error
      ? `BD gth_directory · ${storedTotal} guardado(s) · ${tableColumns.length} col. API · mostrando ${filteredRows.length}${hasActiveFilters ? ' filtrados' : ''}${
          newRowsCount > 0 ? ` · ${newRowsCount} nuevo(s) última sync` : ''
        }${
          payload.last_synced_at
            ? ` · sync ${new Date(payload.last_synced_at).toLocaleString()}`
            : ' · sin importación'
        }`
      : null;

  const showNewColumn = newRowsCount > 0;

  return (
    <div className="settings-gth settings-gth--compact">
      <div className="settings-gth__toolbar settings-gth__toolbar--compact">
        <div className="settings-gth__search-wrap">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="search"
            className="chat-input settings-gth__search"
            placeholder="Buscar nombre, documento, cargo…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={loading}
            aria-label="Buscar en todas las columnas"
          />
        </div>
        {GTH_FILTER_FIELDS.map((field) => (
          <label key={field} className="settings-gth__filter settings-gth__filter--inline">
            <span>{field}</span>
            <select
              className="chat-input settings-gth__filter-select"
              value={filters[field] ?? ''}
              onChange={(e) =>
                setFilters((prev) => {
                  const next = { ...prev };
                  const v = e.target.value;
                  if (v) next[field] = v;
                  else delete next[field];
                  return next;
                })
              }
              disabled={loading || allRows.length === 0}
              aria-label={`Filtrar por ${field}`}
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
        <label className="settings-gth__filter settings-gth__filter--inline settings-gth__filter--checkbox">
          <input
            type="checkbox"
            checked={onlyNewLastSync}
            onChange={(e) => setOnlyNewLastSync(e.target.checked)}
            disabled={loading || newRowsCount === 0}
          />
          <span>Solo nuevos (última sync)</span>
        </label>
        <div className="settings-gth__toolbar-end">
          {metaLine ? (
            <span className="settings-gth__meta" title="Tabla PostgreSQL gth_directory">
              {metaLine}
            </span>
          ) : loading && !payload ? (
            <span className="settings-gth__meta">Cargando BD…</span>
          ) : null}
          <button
            type="button"
            className="settings-btn settings-btn--small settings-btn--compact settings-btn--primary"
            onClick={() => void syncFromApi()}
            disabled={loading || syncing}
            title="Importa CONEXION-GTH, actualiza gth_directory, usuarios del sistema (login OTP) y Comunicaciones"
          >
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--small settings-btn--compact"
            onClick={() => void loadFromDb()}
            disabled={loading || syncing}
            title="Recargar desde la base de datos local"
          >
            {loading ? '…' : 'Recargar'}
          </button>
          {hasActiveFilters ? (
            <button
              type="button"
              className="settings-btn settings-btn--small settings-btn--compact settings-btn--ghost"
              onClick={clearFilters}
            >
              Limpiar
            </button>
          ) : null}
          <Link
            to="/settings?tab=integrations"
            className="settings-btn settings-btn--small settings-btn--compact settings-btn--ghost"
            title="Configuración de integraciones API"
          >
            API
          </Link>
        </div>
      </div>

      {syncHint ? (
        <p className="settings-gth__alert settings-gth__sync-hint" role="status">
          {syncHint}
        </p>
      ) : null}
      {error ? <p className="settings-gth__alert settings-error">{error}</p> : null}
      {payload?.body_truncated ? (
        <p className="settings-gth__alert settings-error" role="alert">
          {payload.error ?? 'Respuesta truncada: el cuerpo supera el límite del servidor.'}
        </p>
      ) : null}
      {payload?.error && !payload.body_truncated ? (
        <p className="settings-gth__alert settings-error">{payload.error}</p>
      ) : null}

      {payload && storedTotal === 0 && !loading && !error ? (
        <p className="settings-gth__alert settings-muted">
          No hay datos en la BD interna. Pulse <strong>Sincronizar</strong> para importar desde CONEXION-GTH.
        </p>
      ) : null}

      {payload && !error && !payload.body_truncated ? (
        <div className="settings-gth-canvas" aria-label="Tabla directorio GTH">
        <div className="settings-gth-table-wrap">
          <table className="settings-gth-table">
            <thead>
              <tr>
                {showNewColumn ? (
                  <th scope="col" className="settings-gth-table__col-new">
                    Nuevo
                  </th>
                ) : null}
                {tableColumns.map((col) => (
                  <th key={col} scope="col" title={col}>
                    {gthTableColumnLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length + (showNewColumn ? 1 : 0)}
                    className="settings-muted"
                  >
                    {allRows.length === 0
                      ? 'Sin registros en gth_directory. Use Sincronizar para importar desde CONEXION-GTH.'
                      : onlyNewLastSync
                        ? 'Ningún registro nuevo en la última sincronización (o no coincide con los filtros).'
                        : 'Ningún registro coincide con los filtros.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(({ row, sourceIndex }, ri) => {
                  const isNew = isRowNewInLastSync(row, sourceIndex, newRowMatchers);
                  return (
                  <tr
                    key={`${pickGthRowDocumentId(row) || 'row'}-${sourceIndex}-${page}-${ri}`}
                    className={[
                      'settings-gth-table__row--clickable',
                      isNew ? 'settings-gth-table__row--new' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="button"
                    tabIndex={0}
                    title="Ver detalle del registro"
                    onClick={() => setDetailRow({ row, sourceIndex, isNew })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailRow({ row, sourceIndex, isNew });
                      }
                    }}
                  >
                    {showNewColumn ? (
                      <td className="settings-gth-table__col-new">
                        {isNew ? (
                          <span className="settings-gth-badge-new" title="Alta en la última sincronización">
                            Nuevo
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    ) : null}
                    {tableColumns.map((col) => {
                      const cellText = gthTableCellText(row, col);
                      const resolved = resolveGthCellValue(row, col);
                      const { text, title } = cellDisplay(cellText === '—' ? '' : cellText);
                      const cellTitle =
                        title ??
                        (resolved.sourceKey
                          ? `Columna «${gthTableColumnLabel(col)}» ← campo API «${resolved.sourceKey}»`
                          : cellText !== '—'
                            ? gthTableColumnLabel(col)
                            : `Sin dato en el API para «${gthTableColumnLabel(col)}»`);
                      const isDocCol = gthTableColumnLabel(col) === 'DOCUMENTO' && isNew;
                      return (
                        <td key={col} title={cellTitle}>
                          {isDocCol ? (
                            <span className="settings-gth-doc-with-badge">
                              {text || '—'}
                            </span>
                          ) : (
                            text || '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          {filteredRows.length > PAGE_SIZE ? (
            <footer className="settings-gth__pagination settings-gth__pagination--inset">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} / {filteredRows.length} ·{' '}
                {page}/{totalPages}
              </span>
              <div className="settings-gth__pagination-btns">
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--compact"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--compact"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ›
                </button>
              </div>
            </footer>
          ) : null}
        </div>
      ) : null}

      <SettingsUsersGthRowModal
        open={detailRow !== null}
        row={detailRow?.row ?? null}
        tableColumns={tableColumns}
        isNew={detailRow?.isNew}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
