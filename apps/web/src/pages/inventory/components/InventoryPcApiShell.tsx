import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  getInventoryHojaDeVida,
  postInventoryHojaDeVidaSync,
  type InventoryHojaDeVidaListResponse,
} from '../../../lib/api';
import { INVENTORY_PC_API_FIELDS } from '../inventoryPcApiFields';

const DEFAULT_PC_INTEGRATION_NAME = 'api-bd.sistemas';
const CELL_PREVIEW_LEN = 56;
/** Filas por página (evita lista larga y scroll vertical excesivo en la vista). */
const PAGE_SIZE = 15;

type Props = {
  departmentId: string;
  departmentName: string;
  showAdminSettingsLink: boolean;
  /** Nombre exacto de la integración en Configuración (por defecto api-bd.sistemas). */
  integrationName?: string;
};

function formatCellRaw(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function cellDisplay(full: string): { text: string; title?: string } {
  const t = full.trim();
  if (!t) return { text: '' };
  if (t.length <= CELL_PREVIEW_LEN) return { text: t };
  return { text: `${t.slice(0, CELL_PREVIEW_LEN)}…`, title: t };
}

/**
 * Subpestaña PC «BD HOJA DE VIDA»: la tabla lee solo PostgreSQL (`hoja_de_vida`).
 * La integración externa solo se consulta al pulsar «Sincronizar» (nunca al abrir la vista).
 */
export function InventoryPcApiShell({
  departmentId,
  departmentName,
  showAdminSettingsLink,
  integrationName = DEFAULT_PC_INTEGRATION_NAME,
}: Props) {
  /** Carga inicial / recarga desde BD (solo GET interno, sin API externa). */
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [payload, setPayload] = useState<InventoryHojaDeVidaListResponse | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [departmentId, integrationName]);

  const loadFromDb = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    setError(null);
    setSyncHint(null);
    try {
      const data = await getInventoryHojaDeVida(departmentId, { integrationName });
      setPayload(data);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'No se pudieron cargar los datos de la tabla hoja_de_vida.';
      setError(msg);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [departmentId, integrationName]);

  /** POST a integración + relectura desde BD. No se llama al montar el componente. */
  const syncFromApiThenReload = useCallback(async () => {
    if (!departmentId || loading || syncing) return;
    setSyncing(true);
    setError(null);
    setSyncHint(null);
    let syncMessage: string | null = null;
    try {
      const sync = await postInventoryHojaDeVidaSync(departmentId, { integrationName });
      if (!sync.ok) {
        syncMessage = sync.error ?? 'La importación desde el API no se completó.';
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        syncMessage =
          'Sin permiso para sincronizar desde el API (se requiere rol de edición en inventario). Se muestran los datos ya guardados en la BD interna.';
      } else {
        syncMessage = e instanceof ApiError ? e.message : 'Error al sincronizar con el API.';
      }
    }
    try {
      const data = await getInventoryHojaDeVida(departmentId, { integrationName });
      setPayload(data);
      setSyncHint(syncMessage);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'No se pudieron cargar los datos de la tabla hoja_de_vida.';
      setError(syncMessage ? `${syncMessage} ${msg}` : msg);
      setPayload(null);
    } finally {
      setSyncing(false);
    }
  }, [departmentId, integrationName, loading, syncing]);

  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  const rows = payload?.rows ?? [];
  const httpOk = payload?.http?.ok === true;
  const showTable = payload != null && !error;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
    [rows.length],
  );

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  return (
    <>
      <header className="inventory-page-header">
        <div>
          <h2 className="inventory-page-title">BD HOJA DE VIDA</h2>
          <p className="inventory-page-subtitle">
            Origen único: tabla PostgreSQL <code>hoja_de_vida</code> del departamento «{departmentName}». La integración «
            {integrationName}» solo se usa si pulsa <strong>Sincronizar</strong> (no al abrir esta pantalla).
          </p>
        </div>
      </header>

      <div className="inventory-api-shell">
        <div className="inventory-api-shell__toolbar">
          <p className="inventory-api-shell__lead" style={{ margin: 0 }}>
            Al entrar aquí <strong>no</strong> se llama al API externo: solo se lee la BD interna. Use{' '}
            <strong>Sincronizar</strong> cuando quiera traer datos del API a <code>hoja_de_vida</code> (misma máscara de
            campos que en el sondeo de la integración).
          </p>
          <div className="inventory-api-shell__toolbar-actions">
            <button
              type="button"
              className="inventory-tab inventory-tab--active"
              disabled={loading || syncing}
              onClick={() => void syncFromApiThenReload()}
              aria-busy={syncing}
              title="Consulta el API de la integración y sustituye las filas de hoja_de_vida en la BD de este departamento"
            >
              {syncing ? 'Sincronizando…' : loading ? 'Cargando…' : 'Sincronizar'}
            </button>
            {showAdminSettingsLink ? (
              <Link to="/settings?tab=integrations" className="inventory-tab inventory-tab--active">
                Integraciones API
              </Link>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="inventory-alert inventory-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        {loading && !payload ? <p className="settings-muted">Cargando tabla hoja_de_vida…</p> : null}

        {syncHint ? (
          <p className="inventory-api-shell__hint" role="status">
            {syncHint}
          </p>
        ) : null}

        {showTable && payload ? (
          <>
            <p className="inventory-api-shell__meta">
              Tabla <code>hoja_de_vida</code> · <strong>{payload.total_stored}</strong> registro(s) en BD · Integración:{' '}
              <strong>{payload.integration.name}</strong>
              {httpOk ? (
                <>
                  {' '}
                  · {payload.http.status_text}
                </>
              ) : null}
              {payload.last_synced_at ? (
                <>
                  {' '}
                  · Última importación:{' '}
                  <time dateTime={payload.last_synced_at}>
                    {new Date(payload.last_synced_at).toLocaleString()}
                  </time>
                </>
              ) : (
                <> · Aún no hay importación registrada</>
              )}
            </p>

            <div className="inventory-api-shell__canvas inventory-api-shell__canvas--table" aria-label="Tabla equipos PC">
              <div className="inventory-api-pc-table-wrap">
                <table className="inventory-api-pc-table">
                  <thead>
                    <tr>
                      {INVENTORY_PC_API_FIELDS.map((field) => (
                        <th key={field} scope="col" title={field}>
                          <code className="inventory-api-pc-table__field">{field}</code>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        {INVENTORY_PC_API_FIELDS.map((field) => (
                          <td key={field} className="inventory-api-pc-table__cell inventory-api-pc-table__cell--empty">
                            <span className="inventory-api-pc-table__placeholder">—</span>
                          </td>
                        ))}
                      </tr>
                    ) : (
                      pageRows.map((row, ri) => (
                        <tr key={String(row.id_pc ?? row.num_serie ?? `${page}-${ri}`)}>
                          {INVENTORY_PC_API_FIELDS.map((field) => {
                            const full = formatCellRaw(row[field]);
                            const { text, title } = cellDisplay(full);
                            const truncated = Boolean(title);
                            return (
                              <td key={field} className="inventory-api-pc-table__cell">
                                {text ? (
                                  <span
                                    className="inventory-api-pc-table__cell-text"
                                    title={truncated ? title : undefined}
                                  >
                                    {text}
                                  </span>
                                ) : (
                                  <span className="inventory-api-pc-table__placeholder">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {rows.length > PAGE_SIZE ? (
                <footer className="inventory-footer inventory-footer--api-pc">
                  <p className="inventory-footer__meta">
                    Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} de {rows.length}.
                    Página {page} de {totalPages}.
                  </p>
                  <div className="inventory-pagination">
                    <button
                      type="button"
                      className="secondary"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </footer>
              ) : null}
              {httpOk && rows.length === 0 ? (
                <p className="inventory-api-shell__hint">
                  No hay filas en la tabla interna. Pulse <strong>Sincronizar</strong> para traer datos del API a la BD
                  (requiere permiso de edición en inventario).
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
