import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InventoryPcChecklistForm } from './inventory/components/InventoryPcChecklistForm';
import { DEFAULT_SETTINGS_TAB, isValidSettingsTab, type SettingsTabId } from './settingsNavConfig';
import {
  adminCreateDepartment,
  adminCreateIntegration,
  adminCreateTemplate,
  adminCreateTemplateField,
  adminCreateTicketPriority,
  adminCreateTicketStatus,
  adminCreateWorkflow,
  adminCreateWorkflowTransition,
  adminDeleteIntegration,
  adminDeleteTemplateField,
  adminDeleteTicketPriority,
  adminDeleteTicketStatus,
  adminDeleteWorkflowTransition,
  adminGetRuntimeConfig,
  adminListDepartments,
  adminListIntegrations,
  adminListTemplates,
  adminListTicketPriorities,
  adminListTicketStatuses,
  adminListUsers,
  adminListWorkflows,
  adminProbeIntegration,
  adminSetUserDepartmentRoles,
  adminUpdateDepartment,
  adminUpdateIntegration,
  adminUpdateTemplate,
  adminUpdateUserGlobalRole,
  adminUpdateWorkflow,
  ApiError,
  getCurrentUserProfile,
  getTicketDepartments,
  isGlobalAdminRole,
  normalizeGlobalRole,
  persistUserRolesFromProfile,
  type AdminDepartmentRow,
  type AdminIntegrationRow,
  type AdminRuntimeConfig,
  type AdminTemplateRow,
  type AdminTicketPriorityRow,
  type AdminTicketStatusRow,
  type AdminUserRow,
  type AdminWorkflowRow,
  type CurrentUserProfile,
  type DepartmentRoleEntry,
} from '../lib/api';

function settingsErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatProbePreviewPayload(payload: unknown): string {
  try {
    if (typeof payload === 'string') return payload;
    const seen = new WeakSet<object>();
    return JSON.stringify(
      payload,
      (_k, v) => {
        if (typeof v === 'bigint') return v.toString();
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      },
      2,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `No se pudo serializar la respuesta para visualizarla.\n\nError: ${msg}`;
  }
}

/**
 * Escribe la vista previa en una ventana ya abierta.
 * Importante: `window.open` debe ejecutarse en el mismo turno del clic del usuario;
 * si se llama después de un `await`, el navegador suele bloquear el popup.
 */
function writeProbePreviewToWindow(w: Window, payload: unknown, title: string) {
  const safeTitle = escapeHtml(title);
  w.document.open();
  w.document.write(
    `<!DOCTYPE html><html lang="es" style="height:100%"><head><meta charset="utf-8"/><title>${safeTitle}</title><style>html,body{height:100%;margin:0;background:#0f172a;color:#e2e8f0}pre{margin:0;padding:16px;font:13px/1.45 ui-monospace,Cascadia Mono,Consolas,monospace;white-space:pre-wrap;word-break:break-word;box-sizing:border-box;min-height:100%}</style></head><body><pre></pre></body></html>`,
  );
  w.document.close();
  const pre = w.document.querySelector('pre');
  if (!pre) return;
  pre.textContent = formatProbePreviewPayload(payload);
  try {
    w.focus();
  } catch {
    /* ignore */
  }
}

const PROBE_CELL_FULL_MAX = 2400;
/** Caracteres visibles en tabla antes de resumir (el resto va en tooltip). */
const PROBE_CELL_PREVIEW_MAX = 88;

type IntegrationsProbeModel =
  | {
      type: 'table';
      columns: string[];
      rows: Record<string, { preview: string; full: string; truncated: boolean }>[];
    }
  | { type: 'keyValue'; rows: { key: string; preview: string; full: string; truncated: boolean }[] }
  | { type: 'text'; body: string };

function formatProbeCellValue(value: unknown, maxLen = PROBE_CELL_FULL_MAX): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return String(value);
  }
}

function summarizeProbeCellText(full: string, maxPreview: number): { preview: string; full: string; truncated: boolean } {
  if (full.length <= maxPreview) {
    return { preview: full, full, truncated: false };
  }
  const slice = full.slice(0, maxPreview).trimEnd();
  return { preview: `${slice}…`, full, truncated: true };
}

function isRecordObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function buildIntegrationsProbeModel(data: unknown): IntegrationsProbeModel {
  if (data === null || data === undefined) {
    return { type: 'text', body: 'Sin datos.' };
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return { type: 'text', body: 'Lista vacía (0 elementos).' };
    if (data.every((x) => isRecordObject(x))) {
      const colSet = new Set<string>();
      for (const row of data) {
        for (const k of Object.keys(row)) colSet.add(k);
      }
      const columns = Array.from(colSet);
      const rows = (data as Record<string, unknown>[]).map((obj) => {
        const r: Record<string, { preview: string; full: string; truncated: boolean }> = {};
        for (const c of columns) {
          const full = formatProbeCellValue(obj[c]);
          const cell = summarizeProbeCellText(full, PROBE_CELL_PREVIEW_MAX);
          r[c] = cell;
        }
        return r;
      });
      return { type: 'table', columns, rows };
    }
    return {
      type: 'table',
      columns: ['#', 'Valor'],
      rows: data.map((v, i) => {
        const full = formatProbeCellValue(v);
        const cell = summarizeProbeCellText(full, PROBE_CELL_PREVIEW_MAX);
        return { '#': { preview: String(i), full: String(i), truncated: false }, Valor: cell };
      }),
    };
  }
  if (isRecordObject(data)) {
    const keys = Object.keys(data);
    if (keys.length === 0) return { type: 'text', body: 'Objeto vacío.' };
    const rows = keys.map((key) => {
      const full = formatProbeCellValue(data[key]);
      const { preview, full: f, truncated } = summarizeProbeCellText(full, PROBE_CELL_PREVIEW_MAX);
      return { key, preview, full: f, truncated };
    });
    return { type: 'keyValue', rows };
  }
  return { type: 'text', body: formatProbeCellValue(data) };
}

function probeFromNonJsonString(raw: string): { model: IntegrationsProbeModel; exportText: string } {
  const t = raw.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      const parsed: unknown = JSON.parse(t);
      return { model: buildIntegrationsProbeModel(parsed), exportText: t };
    } catch {
      return { model: { type: 'text', body: raw }, exportText: raw };
    }
  }
  return { model: { type: 'text', body: raw }, exportText: raw };
}

type ProbeTableCell = { preview: string; full: string; truncated: boolean };

const PROBE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function IntegrationsProbePaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activePage = Math.min(page, totalPages - 1);
  const start = activePage * pageSize;
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);

  return (
    <div className="settings-api-preview-table-toolbar">
      <span className="settings-api-preview-table-toolbar__info">
        {total === 0 ? 'Sin filas' : `Filas ${from}–${to} de ${total}`}
      </span>
      <label className="settings-api-page-size">
        Por página
        <select
          className="chat-input"
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(0);
          }}
        >
          {PROBE_PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-api-pagination">
        <button
          type="button"
          className="settings-btn settings-btn--small secondary"
          disabled={activePage <= 0}
          onClick={() => onPageChange(activePage - 1)}
        >
          Anterior
        </button>
        <span className="settings-api-pagination-status">
          Página {activePage + 1} / {totalPages}
        </span>
        <button
          type="button"
          className="settings-btn settings-btn--small secondary"
          disabled={activePage >= totalPages - 1}
          onClick={() => onPageChange(activePage + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function IntegrationsProbePagedDataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, ProbeTableCell>[];
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(0);
  }, [columns, rows]);

  const total = rows.length;

  useEffect(() => {
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    setPage((p) => Math.min(p, last));
  }, [total, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activePage = Math.min(page, totalPages - 1);
  const start = activePage * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <>
      <IntegrationsProbePaginationBar
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <div className="settings-api-preview-table-wrap">
        <table className="settings-table settings-api-probe-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={start + ri}>
                {columns.map((c) => {
                  const cell = row[c];
                  const text = cell?.preview ?? '';
                  const full = cell?.full ?? text;
                  const truncated = cell?.truncated ?? false;
                  return (
                    <td key={c} className="settings-api-probe-cell">
                      <span
                        className="settings-api-probe-cell-text"
                        title={truncated ? full : undefined}
                      >
                        {text}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IntegrationsProbePagedKeyValue({
  rows,
}: {
  rows: { key: string; preview: string; full: string; truncated: boolean }[];
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  const total = rows.length;

  useEffect(() => {
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    setPage((p) => Math.min(p, last));
  }, [total, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activePage = Math.min(page, totalPages - 1);
  const start = activePage * pageSize;
  const slice = rows.slice(start, start + pageSize);

  return (
    <>
      <IntegrationsProbePaginationBar
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <div className="settings-api-preview-table-wrap">
        <table className="settings-table settings-api-probe-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.key}>
                <td>
                  <code>{r.key}</code>
                </td>
                <td className="settings-api-probe-cell">
                  <span
                    className="settings-api-probe-cell-text"
                    title={r.truncated ? r.full : undefined}
                  >
                    {r.preview}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function IntegrationsProbePreviewBody({ model }: { model: IntegrationsProbeModel }) {
  if (model.type === 'text') {
    return <div className="settings-api-probe-fallback">{model.body}</div>;
  }
  if (model.type === 'keyValue') {
    return <IntegrationsProbePagedKeyValue rows={model.rows} />;
  }
  return <IntegrationsProbePagedDataTable columns={model.columns} rows={model.rows} />;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    supervisor: 'Supervisor',
    tecnico_area: 'Técnico de área',
    solicitante: 'Solicitante',
  };
  return map[role] ?? role;
}

function etiquetaCategoriaEstado(category: string): string {
  if (category === 'active' || category === 'activo') return 'Activo';
  return category;
}

function SettingsUserAccount({
  profile,
  embedded = false,
}: {
  profile: CurrentUserProfile;
  embedded?: boolean;
}) {
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void getTicketDepartments()
      .then((rows) => {
        const m: Record<string, string> = {};
        for (const d of Array.isArray(rows) ? rows : []) {
          if (d?.id) m[d.id] = d.name ?? '';
        }
        setDeptNames(m);
      })
      .catch(() => undefined);
  }, []);

  const deptLabel = useMemo(
    () => (id: string) => deptNames[id] ?? id,
    [deptNames],
  );

  const departmentRoles = Array.isArray(profile?.department_roles) ? profile.department_roles : [];

  const card = (
    <div className="module-card" style={{ maxWidth: embedded ? '100%' : '42rem' }}>
      <h2 style={{ marginTop: 0 }}>Mi cuenta</h2>
          <dl className="employee-profile-modal__fields" style={{ margin: 0 }}>
            <div className="employee-profile-modal__row">
              <dt>Nombre</dt>
              <dd>{profile.name}</dd>
            </div>
            <div className="employee-profile-modal__row">
              <dt>ID empleado</dt>
              <dd>{profile.employee_id}</dd>
            </div>
            <div className="employee-profile-modal__row">
              <dt>Correo</dt>
              <dd>{profile.email ?? '—'}</dd>
            </div>
            <div className="employee-profile-modal__row">
              <dt>Cargo</dt>
              <dd>{profile.job_title ?? '—'}</dd>
            </div>
            <div className="employee-profile-modal__row">
              <dt>Dependencia</dt>
              <dd>{profile.dependency_name ?? '—'}</dd>
            </div>
            <div className="employee-profile-modal__row">
              <dt>Rol global</dt>
              <dd>
                {isGlobalAdminRole(profile.global_role)
                  ? 'Administrador'
                  : normalizeGlobalRole(profile.global_role) === 'auditor'
                    ? 'Auditor'
                    : profile.global_role ?? '—'}
              </dd>
            </div>
          </dl>
          <h3>Roles por departamento</h3>
          {departmentRoles.length === 0 ? (
            <p className="settings-muted">Sin roles de departamento asignados.</p>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {departmentRoles.map((r) => (
                <li key={`${r.department_id}-${r.role}`}>
                  <strong>{deptLabel(r.department_id)}</strong> · {roleLabel(r.role)}
                </li>
              ))}
            </ul>
          )}
          <p className="settings-muted" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            La sesión y el acceso a tickets/chat los define el servidor según estos datos.
          </p>
          {!embedded ? (
            <p style={{ marginTop: '1rem' }}>
              <Link to="/">Volver al inicio</Link>
            </p>
          ) : null}
        </div>
  );

  if (embedded) {
    return card;
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1 className="settings-title">Configuración</h1>
        <p className="settings-subtitle">
          Datos de tu cuenta y roles. Los catálogos y parámetros globales solo los gestionan administradores.
        </p>
      </header>
      <div className="settings-panel">{card}</div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [integrationsPane, setIntegrationsPane] = useState<'list' | 'new' | 'preview'>('list');

  const tabParam = searchParams.get('tab');
  const tab: SettingsTabId = isValidSettingsTab(tabParam) ? tabParam : DEFAULT_SETTINGS_TAB;

  useEffect(() => {
    if (!isValidSettingsTab(tabParam)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', DEFAULT_SETTINGS_TAB);
          return next;
        },
        { replace: true },
      );
    }
  }, [tabParam, setSearchParams]);

  useEffect(() => {
    void getCurrentUserProfile()
      .then((p) => {
        persistUserRolesFromProfile(p);
        setProfile(p);
        setAllowed(isGlobalAdminRole(p.global_role));
      })
      .catch(() => {
        setProfile(null);
        setAllowed(false);
      });
  }, []);

  if (allowed === null) {
    return (
      <div className="settings-page">
        <p className="settings-muted">Cargando configuración…</p>
      </div>
    );
  }

  if (!allowed && profile) {
    return <SettingsUserAccount profile={profile} />;
  }

  if (!allowed) {
    return (
      <div className="settings-page">
        <h1 className="settings-title">Configuración</h1>
        <p>No se pudo cargar tu perfil. Vuelve a iniciar sesión.</p>
        <Link to="/">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className={tab === 'integrations' ? 'settings-page settings-page--integrations-wide' : 'settings-page'}>
      <header className="settings-header">
        <h1 className="settings-title">Configuración</h1>
        <p className="settings-subtitle">Parámetros de negocio y catálogos (solo administradores).</p>
      </header>
      {hint ? (
        <p className="settings-hint" role="status">
          {hint}
        </p>
      ) : null}
      {tab === 'integrations' ? (
        <div className="settings-api-panel-tabs" role="tablist" aria-label="Secciones integraciones API">
          <div className="settings-tab-row">
            <button
              type="button"
              role="tab"
              aria-selected={integrationsPane === 'list'}
              className={`settings-tab${integrationsPane === 'list' ? ' settings-tab--active' : ''}`}
              onClick={() => setIntegrationsPane('list')}
            >
              Registradas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={integrationsPane === 'new'}
              className={`settings-tab${integrationsPane === 'new' ? ' settings-tab--active' : ''}`}
              onClick={() => setIntegrationsPane('new')}
            >
              Nueva integración
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={integrationsPane === 'preview'}
              className={`settings-tab${integrationsPane === 'preview' ? ' settings-tab--active' : ''}`}
              onClick={() => setIntegrationsPane('preview')}
            >
              Vista previa del sondeo
            </button>
          </div>
        </div>
      ) : null}
      <div className="settings-panel" role="region" aria-label="Contenido de configuración">
        {tab === 'account' && profile ? <SettingsUserAccount profile={profile} embedded /> : null}
        {tab === 'general' ? <SettingsGeneral /> : null}
        {tab === 'tickets' ? <SettingsTickets onMessage={setHint} /> : null}
        {tab === 'workflows' ? <SettingsWorkflows onMessage={setHint} /> : null}
        {tab === 'templates' ? <SettingsTemplates onMessage={setHint} /> : null}
        {tab === 'chat' ? <SettingsChat /> : null}
        {tab === 'inventory_pc' ? <SettingsInventoryPc onMessage={setHint} /> : null}
        {tab === 'system' ? <SettingsSystem onMessage={setHint} /> : null}
        {tab === 'integrations' ? (
          <SettingsIntegrations
            onMessage={setHint}
            pane={integrationsPane}
            onPaneChange={setIntegrationsPane}
          />
        ) : null}
        {tab === 'users' ? <SettingsUsers onMessage={setHint} /> : null}
      </div>
    </div>
  );
}

function SettingsGeneral() {
  return (
    <section>
      <h2>General</h2>
      <p className="settings-muted">
        Preferencias globales de la organización. Los datos personales están en el menú del avatar (cabecera).
      </p>
    </section>
  );
}

function SettingsInventoryPc({ onMessage }: { onMessage: (s: string | null) => void }) {
  return (
    <section>
      <h2>Inventario PC — listas de sugerencias</h2>
      <p className="settings-muted">
        Opciones que aparecen como sugerencias al registrar o editar equipos PC (tipo de disco, RAM, sistema
        operativo, etc.). Los equipos siguen admitiendo texto libre.
      </p>
      <InventoryPcChecklistForm
        onMessage={(m) => {
          onMessage(m);
        }}
      />
    </section>
  );
}

function SettingsChat() {
  return (
    <section>
      <h2>Chat</h2>
      <p>
        Límite del directorio de usuarios y tamaño máximo de adjuntos se configuran en el servidor (variables de
        entorno). Consulta la pestaña <strong>Sistema</strong> para valores efectivos no secretos.
      </p>
    </section>
  );
}

function SettingsSystem({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [cfg, setCfg] = useState<AdminRuntimeConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    void adminGetRuntimeConfig()
      .then(setCfg)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section>
      <h2>Sistema</h2>
      <p className="settings-muted">Sin secretos (contraseñas, claves JWT o URL completa de base de datos).</p>
      {err ? <p className="settings-error">{err}</p> : null}
      <button type="button" className="settings-btn" onClick={() => (load(), onMessage(null))}>
        Actualizar
      </button>
      {cfg ? (
        <dl className="settings-dl">
          {Object.entries(cfg).map(([k, v]) => (
            <div key={k} className="settings-dl-row">
              <dt>{k}</dt>
              <dd>{typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Cargando…</p>
      )}
    </section>
  );
}

function SettingsTickets({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [statuses, setStatuses] = useState<AdminTicketStatusRow[]>([]);
  const [priorities, setPriorities] = useState<AdminTicketPriorityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    onMessage(null);
    void Promise.all([adminListDepartments(), adminListTicketStatuses(), adminListTicketPriorities()])
      .then(([d, s, p]) => {
        setDepartments(d);
        setStatuses(s);
        setPriorities(p);
      })
      .catch((e) => onMessage(e instanceof ApiError ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addDepartment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await adminCreateDepartment({ name, description: String(fd.get('description') ?? '').trim() || undefined });
      onMessage('Departamento creado');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function toggleDept(d: AdminDepartmentRow) {
    try {
      await adminUpdateDepartment(d.id, { is_active: !d.isActive });
      refresh();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function saveDeptInventory(e: FormEvent<HTMLFormElement>, departmentId: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const example = String(fd.get('asset_inventory_code_example') ?? '').trim();
    const pattern = String(fd.get('asset_inventory_code_pattern') ?? '').trim();
    try {
      await adminUpdateDepartment(departmentId, {
        asset_inventory_code_example: example || null,
        asset_inventory_code_pattern: pattern || null,
      });
      onMessage('Formato de código de equipos guardado');
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo guardar el formato de código.'));
    }
  }

  async function addStatus(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateTicketStatus({
        code: String(fd.get('code') ?? '').trim(),
        name: String(fd.get('name') ?? '').trim(),
        category: String(fd.get('category') ?? 'activo').trim() || 'activo',
        is_closed: fd.get('is_closed') === 'on',
        is_default: fd.get('is_default') === 'on',
        sort_order: Number(fd.get('sort_order') ?? 0) || 0,
      });
      onMessage('Estado creado');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function addPriority(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateTicketPriority({
        code: String(fd.get('code') ?? '').trim(),
        name: String(fd.get('name') ?? '').trim(),
        response_minutes: fd.get('response_minutes')
          ? Number(fd.get('response_minutes'))
          : null,
        resolution_minutes: fd.get('resolution_minutes')
          ? Number(fd.get('resolution_minutes'))
          : null,
      });
      onMessage('Prioridad creada');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  if (loading) return <p>Cargando catálogos…</p>;

  return (
    <section className="settings-stack">
      <h2>Tickets — catálogos</h2>

      <h3>Departamentos</h3>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Activo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <Fragment key={d.id}>
              <tr>
                <td>{d.name}</td>
                <td>{d.isActive ? 'sí' : 'no'}</td>
                <td>
                  <button type="button" className="settings-btn settings-btn--small" onClick={() => void toggleDept(d)}>
                    {d.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ paddingTop: 0, borderTop: 'none' }}>
                  <form
                    key={`inv-${d.id}-${d.updatedAt}`}
                    className="settings-form settings-form--grid"
                    style={{ marginBottom: '1rem' }}
                    onSubmit={(e) => void saveDeptInventory(e, d.id)}
                  >
                    <p className="settings-muted" style={{ gridColumn: '1 / -1', margin: '0 0 0.35rem' }}>
                      Códigos de inventario de equipos: el valor debe coincidir con el número de serie registrado en
                      cada activo al vincularlo a un ticket.
                    </p>
                    <input
                      name="asset_inventory_code_example"
                      placeholder="Ejemplo (p. ej. SYSTEM0000)"
                      defaultValue={d.assetInventoryCodeExample ?? ''}
                      className="chat-input"
                      aria-label={`Ejemplo código inventario ${d.name}`}
                    />
                    <input
                      name="asset_inventory_code_pattern"
                      placeholder="Regex (p. ej. ^SYSTEM\\d{4}$)"
                      defaultValue={d.assetInventoryCodePattern ?? ''}
                      className="chat-input"
                      aria-label={`Patrón regex inventario ${d.name}`}
                    />
                    <button type="submit" className="settings-btn settings-btn--small">
                      Guardar formato
                    </button>
                  </form>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <form className="settings-form" onSubmit={(e) => void addDepartment(e)}>
        <input name="name" placeholder="Nombre" required className="chat-input" />
        <input name="description" placeholder="Descripción" className="chat-input" />
        <button type="submit" className="settings-btn">
          Añadir departamento
        </button>
      </form>

      <h3>Estados</h3>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Por defecto</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td>
              <td>{s.name}</td>
              <td>{etiquetaCategoriaEstado(s.category)}</td>
              <td>{s.isDefault ? 'sí' : 'no'}</td>
              <td>
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--danger"
                  onClick={() =>
                    void adminDeleteTicketStatus(s.id)
                      .then(() => refresh())
                      .catch((err) => onMessage(err instanceof ApiError ? err.message : 'Error'))
                  }
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="settings-form settings-form--grid" onSubmit={(e) => void addStatus(e)}>
        <input name="code" placeholder="código" required className="chat-input" />
        <input name="name" placeholder="nombre" required className="chat-input" />
        <input name="category" placeholder="categoría" className="chat-input" defaultValue="activo" />
        <input name="sort_order" type="number" placeholder="orden" className="chat-input" defaultValue={0} />
        <label className="settings-check">
          <input name="is_closed" type="checkbox" /> Cerrado
        </label>
        <label className="settings-check">
          <input name="is_default" type="checkbox" /> Por defecto
        </label>
        <button type="submit" className="settings-btn">
          Añadir estado
        </button>
      </form>

      <h3>Prioridades</h3>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Resp. min</th>
            <th>Resol. min</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {priorities.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{p.responseMinutes ?? '—'}</td>
              <td>{p.resolutionMinutes ?? '—'}</td>
              <td>
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--danger"
                  onClick={() =>
                    void adminDeleteTicketPriority(p.id)
                      .then(() => refresh())
                      .catch((err) => onMessage(err instanceof ApiError ? err.message : 'Error'))
                  }
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="settings-form settings-form--grid" onSubmit={(e) => void addPriority(e)}>
        <input name="code" placeholder="código" required className="chat-input" />
        <input name="name" placeholder="nombre" required className="chat-input" />
        <input name="response_minutes" type="number" placeholder="min respuesta" className="chat-input" />
        <input name="resolution_minutes" type="number" placeholder="min resolución" className="chat-input" />
        <button type="submit" className="settings-btn">
          Añadir prioridad
        </button>
      </form>
    </section>
  );
}

function SettingsWorkflows({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [rows, setRows] = useState<AdminWorkflowRow[]>([]);
  const [statuses, setStatuses] = useState<AdminTicketStatusRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);

  const refresh = useCallback(() => {
    onMessage(null);
    void Promise.all([adminListWorkflows(), adminListTicketStatuses(), adminListDepartments()]).then(
      ([w, s, d]) => {
        setRows(w);
        setStatuses(s);
        setDepartments(d);
      },
    );
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addWorkflow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateWorkflow({
        department_id: String(fd.get('department_id')),
        name: String(fd.get('name') ?? '').trim(),
      });
      onMessage('Flujo creado');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function addTransition(e: FormEvent<HTMLFormElement>, workflowId: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateWorkflowTransition(workflowId, {
        from_status_id: String(fd.get('from_status_id')),
        to_status_id: String(fd.get('to_status_id')),
        requires_comment: fd.get('requires_comment') === 'on',
        requires_resolution: fd.get('requires_resolution') === 'on',
        requires_checklist: fd.get('requires_checklist') === 'on',
        requires_supervisor_approval: fd.get('requires_supervisor_approval') === 'on',
      });
      onMessage('Transición añadida');
      refresh();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <section className="settings-stack">
      <h2>Flujos y transiciones</h2>
      <form className="settings-form settings-form--grid" onSubmit={(e) => void addWorkflow(e)}>
        <select name="department_id" required className="chat-input">
          <option value="">Departamento…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Nombre del flujo" required className="chat-input" />
        <button type="submit" className="settings-btn">
          Crear flujo
        </button>
      </form>
      {rows.map((w) => (
        <div key={w.id} className="settings-card">
          <div className="settings-card-head">
            <strong>{w.name}</strong>
            <span className="settings-muted"> {w.department?.name ?? w.departmentId}</span>
            <button
              type="button"
              className="settings-btn settings-btn--small"
              onClick={() =>
                void adminUpdateWorkflow(w.id, { is_active: !w.isActive })
                  .then(() => refresh())
                  .catch((err) => onMessage(err instanceof ApiError ? err.message : 'Error'))
              }
            >
              {w.isActive ? 'Desactivar' : 'Activar'}
            </button>
          </div>
          <ul className="settings-list">
            {w.transitions.map((t) => (
              <li key={t.id}>
                {t.fromStatus?.code ?? t.fromStatusId} → {t.toStatus?.code ?? t.toStatusId}
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--danger"
                  onClick={() =>
                    void adminDeleteWorkflowTransition(t.id)
                      .then(() => refresh())
                      .catch((err) => onMessage(err instanceof ApiError ? err.message : 'Error'))
                  }
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <form className="settings-form settings-form--grid" onSubmit={(e) => void addTransition(e, w.id)}>
            <select name="from_status_id" required className="chat-input">
              <option value="">Desde estado…</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <select name="to_status_id" required className="chat-input">
              <option value="">Hacia estado…</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <label className="settings-check">
              <input name="requires_comment" type="checkbox" /> Comentario
            </label>
            <label className="settings-check">
              <input name="requires_resolution" type="checkbox" /> Resolución
            </label>
            <label className="settings-check">
              <input name="requires_checklist" type="checkbox" /> Lista de verificación
            </label>
            <label className="settings-check">
              <input name="requires_supervisor_approval" type="checkbox" /> Supervisor
            </label>
            <button type="submit" className="settings-btn">
              Añadir transición
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}

function SettingsTemplates({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [rows, setRows] = useState<AdminTemplateRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);

  const refresh = useCallback(() => {
    onMessage(null);
    void Promise.all([adminListTemplates(), adminListDepartments()])
      .then(([t, d]) => {
        setRows(t);
        setDepartments(d);
      })
      .catch((err) =>
        onMessage(settingsErrorMessage(err, 'No se pudieron cargar las plantillas o departamentos.')),
      );
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addTpl(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateTemplate({
        department_id: String(fd.get('department_id')),
        name: String(fd.get('name') ?? '').trim(),
        usage_type: String(fd.get('usage_type') ?? 'ticket_create').trim(),
      });
      onMessage('Plantilla creada');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo crear la plantilla.'));
    }
  }

  async function addField(e: FormEvent<HTMLFormElement>, templateId: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let config: Record<string, unknown> = {};
    const raw = String(fd.get('config_json') ?? '').trim();
    if (raw) {
      try {
        config = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        onMessage('config_json no es JSON válido');
        return;
      }
    }
    try {
      await adminCreateTemplateField(templateId, {
        field_key: String(fd.get('field_key') ?? '').trim(),
        field_label: String(fd.get('field_label') ?? '').trim(),
        field_type: String(fd.get('field_type') ?? 'text').trim(),
        is_required: fd.get('is_required') === 'on',
        config_json: Object.keys(config).length ? config : undefined,
      });
      onMessage('Campo añadido');
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo añadir el campo.'));
    }
  }

  return (
    <section className="settings-stack">
      <h2>Plantillas y campos</h2>
      <form className="settings-form settings-form--grid" onSubmit={(e) => void addTpl(e)}>
        <select name="department_id" required className="chat-input">
          <option value="">Departamento…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Nombre plantilla" required className="chat-input" />
        <input
          name="usage_type"
          placeholder="Tipo de uso (p. ej. ticket_create)"
          className="chat-input"
          defaultValue="ticket_create"
        />
        <button type="submit" className="settings-btn">
          Crear plantilla
        </button>
      </form>
      {rows.map((tpl) => (
        <div key={tpl.id} className="settings-card">
          <div className="settings-card-head">
            <strong>{tpl.name}</strong>
            <span className="settings-muted"> {tpl.usageType}</span>
            <button
              type="button"
              className="settings-btn settings-btn--small"
              onClick={() =>
                void adminUpdateTemplate(tpl.id, { is_active: !tpl.isActive })
                  .then(() => refresh())
                  .catch((err) =>
                    onMessage(settingsErrorMessage(err, 'No se pudo actualizar la plantilla.')),
                  )
              }
            >
              {tpl.isActive ? 'Desactivar' : 'Activar'}
            </button>
          </div>
          <ul className="settings-list">
            {tpl.fields.map((f) => (
              <li key={f.id}>
                <code>{f.fieldKey}</code> — {f.fieldLabel} ({f.fieldType})
                <button
                  type="button"
                  className="settings-btn settings-btn--small settings-btn--danger"
                  onClick={() =>
                    void adminDeleteTemplateField(f.id)
                      .then(() => refresh())
                      .catch((err) =>
                        onMessage(settingsErrorMessage(err, 'No se pudo eliminar el campo.')),
                      )
                  }
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
          <form className="settings-form settings-form--grid" onSubmit={(e) => void addField(e, tpl.id)}>
            <input name="field_key" placeholder="field_key" required className="chat-input" />
            <input name="field_label" placeholder="Etiqueta" required className="chat-input" />
            <input name="field_type" placeholder="tipo (text, number…)" className="chat-input" defaultValue="text" />
            <input name="config_json" placeholder='config JSON opcional e.g. {"max":10}' className="chat-input" />
            <label className="settings-check">
              <input name="is_required" type="checkbox" /> Obligatorio
            </label>
            <button type="submit" className="settings-btn">
              Añadir campo
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}

const AUTH_TYPES = ['none', 'bearer', 'api_key', 'basic'] as const;

function SettingsIntegrations({
  onMessage,
  pane,
  onPaneChange,
}: {
  onMessage: (s: string | null) => void;
  pane: 'list' | 'new' | 'preview';
  onPaneChange: (next: 'list' | 'new' | 'preview') => void;
}) {
  const [rows, setRows] = useState<AdminIntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://');
  const [authType, setAuthType] = useState<string>('none');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [bearerToken, setBearerToken] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-Api-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [basicUser, setBasicUser] = useState('');
  const [basicPass, setBasicPass] = useState('');
  const [maskEditId, setMaskEditId] = useState<string | null>(null);
  const [maskDraft, setMaskDraft] = useState<Record<string, 0 | 1>>({});
  const [maskSaving, setMaskSaving] = useState(false);
  const [probePreview, setProbePreview] = useState<{
    integrationName: string;
    meta: string;
    model: IntegrationsProbeModel;
    exportText: string;
  } | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);

  const refresh = useCallback(() => {
    onMessage(null);
    setLoading(true);
    void adminListIntegrations()
      .then((list) =>
        setRows(
          list.map((r) => ({
            ...r,
            available_fields: Array.isArray(r.available_fields) ? r.available_fields : [],
            response_field_mask:
              r.response_field_mask && typeof r.response_field_mask === 'object' && !Array.isArray(r.response_field_mask)
                ? (r.response_field_mask as Record<string, number>)
                : {},
          })),
        ),
      )
      .catch((e) => onMessage(settingsErrorMessage(e, 'No se pudieron cargar las integraciones.')))
      .finally(() => setLoading(false));
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setBaseUrl('https://');
    setAuthType('none');
    setNotes('');
    setIsActive(true);
    setBearerToken('');
    setApiKeyHeader('X-Api-Key');
    setApiKeyValue('');
    setBasicUser('');
    setBasicPass('');
  }

  function startEdit(r: AdminIntegrationRow) {
    setEditingId(r.id);
    setName(r.name);
    setBaseUrl(r.base_url);
    setAuthType(r.auth_type);
    setNotes(r.notes ?? '');
    setIsActive(r.is_active);
    setBearerToken('');
    setApiKeyHeader('X-Api-Key');
    setApiKeyValue('');
    setBasicUser('');
    setBasicPass('');
    onPaneChange('new');
  }

  function buildCreateBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      auth_type: authType,
      notes: notes.trim() || undefined,
      is_active: isActive,
    };
    if (authType === 'bearer') body.bearer_token = bearerToken.trim();
    if (authType === 'api_key') {
      body.api_key_header = apiKeyHeader.trim();
      body.api_key_value = apiKeyValue.trim();
    }
    if (authType === 'basic') {
      body.basic_username = basicUser.trim();
      body.basic_password = basicPass;
    }
    return body;
  }

  function buildUpdateBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      name: name.trim(),
      base_url: baseUrl.trim(),
      auth_type: authType,
      notes: notes.trim() || null,
      is_active: isActive,
    };
    // Solo enviar credenciales del método elegido. Si no, el placeholder `X-Api-Key` al editar
    // hacía que PATCH incluyera api_key_* vacíos y el API respondía 400 (p. ej. integración Bearer).
    if (authType === 'bearer' && bearerToken.trim()) {
      body.bearer_token = bearerToken.trim();
    }
    if (authType === 'api_key' && (apiKeyHeader.trim() || apiKeyValue.trim())) {
      body.api_key_header = apiKeyHeader.trim();
      body.api_key_value = apiKeyValue.trim();
    }
    if (authType === 'basic') {
      if (basicUser.trim()) body.basic_username = basicUser.trim();
      if (basicPass !== '') body.basic_password = basicPass;
    }
    return body;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onMessage(null);
    try {
      if (editingId) {
        await adminUpdateIntegration(editingId, buildUpdateBody());
        onMessage('Integración actualizada');
      } else {
        await adminCreateIntegration(buildCreateBody());
        onMessage('Integración creada');
      }
      resetForm();
      onPaneChange('list');
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  }

  function openMaskEditor(r: AdminIntegrationRow) {
    setMaskEditId(r.id);
    const draft: Record<string, 0 | 1> = {};
    for (const f of r.available_fields) {
      const v = r.response_field_mask[f];
      draft[f] = v === 0 ? 0 : 1;
    }
    setMaskDraft(draft);
  }

  function closeMaskEditor() {
    setMaskEditId(null);
    setMaskDraft({});
  }

  async function saveMaskSelection() {
    if (!maskEditId) return;
    setMaskSaving(true);
    onMessage(null);
    try {
      await adminUpdateIntegration(maskEditId, { response_field_mask: maskDraft });
      onMessage('Selección de campos guardada.');
      closeMaskEditor();
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo guardar la máscara de campos.'));
    } finally {
      setMaskSaving(false);
    }
  }

  async function onProbe(id: string) {
    onMessage(null);
    const row = rows.find((x) => x.id === id);
    const integrationName = row?.name ?? id;
    onPaneChange('preview');
    setProbeBusy(true);
    setProbePreview({
      integrationName,
      meta: 'En curso',
      model: { type: 'text', body: 'Cargando respuesta del sondeo…' },
      exportText: '',
    });
    try {
      const r = await adminProbeIntegration(id);
      if (r.body_truncated) {
        const body = `HTTP ${r.status} ${r.status_text || ''}\n\nEl cuerpo supera el límite del servidor; no se puede mostrar JSON completo.\nEjecute «Probar» tras reducir la respuesta en el origen o use un endpoint más acotado.`;
        setProbePreview({
          integrationName,
          meta: `HTTP ${r.status} — cuerpo demasiado grande`,
          model: { type: 'text', body },
          exportText: body,
        });
        onMessage(
          `Sondeo: HTTP ${r.status} — el cuerpo supera el límite del servidor. Revise la pestaña «Vista previa del sondeo».`,
        );
      } else if (r.ok && r.filtered !== undefined) {
        setProbePreview({
          integrationName,
          model: buildIntegrationsProbeModel(r.filtered),
          meta: `HTTP ${r.status} ${r.status_text || 'OK'} · Respuesta filtrada`,
          exportText: formatProbePreviewPayload(r.filtered),
        });
        onMessage(`Sondeo: HTTP ${r.status} ${r.status_text || 'OK'}. Resultado en «Vista previa del sondeo».`);
      } else if (r.ok && r.non_json_preview !== undefined) {
        const { model, exportText } = probeFromNonJsonString(r.non_json_preview);
        setProbePreview({
          integrationName,
          model,
          meta: `HTTP ${r.status} · Vista previa`,
          exportText,
        });
        onMessage(`Sondeo: HTTP ${r.status}. Resultado en «Vista previa del sondeo».`);
      } else if (r.ok) {
        const body = `HTTP ${r.status} ${r.status_text || 'OK'}\n\nNo hay cuerpo JSON para vista previa (o la respuesta no es JSON).`;
        setProbePreview({
          integrationName,
          model: { type: 'text', body },
          meta: `HTTP ${r.status} ${r.status_text || 'OK'}`,
          exportText: body,
        });
        onMessage(`Sondeo: HTTP ${r.status} ${r.status_text || 'OK'}`);
      } else {
        const body = `HTTP ${r.status} ${r.status_text || ''}${r.error ? `\n\n${r.error}` : ''}`;
        setProbePreview({
          integrationName,
          model: { type: 'text', body },
          meta: `HTTP ${r.status} — sin éxito`,
          exportText: body,
        });
        onMessage(`Sondeo: HTTP ${r.status} ${r.status_text || ''}${r.error ? ` — ${r.error}` : ''}`);
      }
      refresh();
    } catch (err) {
      const msg = settingsErrorMessage(err, 'No se pudo probar la URL.');
      setProbePreview({
        integrationName,
        model: { type: 'text', body: msg },
        meta: 'Error',
        exportText: msg,
      });
      onMessage(msg);
    } finally {
      setProbeBusy(false);
    }
  }

  return (
    <section className="settings-stack">
      <h2 className="settings-api-page-title">Integraciones API externas</h2>

      {pane === 'preview' ? (
        <div className="settings-api-preview-panel" role="tabpanel" aria-label="Vista previa del sondeo">
          {probeBusy ? <p className="settings-muted">Ejecutando sondeo…</p> : null}
          {probePreview ? (
            <>
              <p className="settings-api-preview-meta">
                <span className="settings-api-preview-meta-name">{probePreview.integrationName}</span>
                <span className="settings-api-preview-meta-sep">·</span>
                <span>{probePreview.meta}</span>
              </p>
              <IntegrationsProbePreviewBody model={probePreview.model} />
              <div className="settings-int-form-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="settings-btn settings-btn--small"
                  disabled={!probePreview.exportText || probeBusy}
                  onClick={() => {
                    const w = window.open('about:blank', '_blank', 'noopener,noreferrer');
                    if (!w) {
                      window.alert('Permita ventanas emergentes para abrir la vista previa en otra pestaña.');
                      return;
                    }
                    writeProbePreviewToWindow(
                      w,
                      probePreview.exportText,
                      `Vista previa — ${probePreview.integrationName}`,
                    );
                  }}
                >
                  Abrir JSON en nueva pestaña
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn--small secondary"
                  onClick={() => onPaneChange('list')}
                >
                  Ir a registradas
                </button>
              </div>
            </>
          ) : !probeBusy ? (
            <p className="settings-muted">
              Use «Probar» en la pestaña Registradas para ver aquí la última respuesta del sondeo en tabla.
            </p>
          ) : null}
        </div>
      ) : null}

      {pane === 'new' ? (
        <form className="settings-integration-form" onSubmit={(e) => void onSubmit(e)} role="tabpanel">
          <div className="settings-int-form-head">
            <h3 className="settings-int-form-title">{editingId ? 'Editar integración' : 'Nueva integración'}</h3>
            <p className="settings-int-form-lead">
              {editingId
                ? 'Modifique el endpoint o la autenticación. Los secretos que deje en blanco no se actualizan en el servidor.'
                : 'Registre un endpoint HTTPS y el modo de acceso. Podrá afinar los campos visibles tras ejecutar un sondeo desde el listado.'}
            </p>
          </div>

          <div className="settings-int-form-section">
            <div className="settings-int-form-section-title">Identificación y endpoint</div>
            <div className="settings-int-form-grid">
              <label className="settings-int-field settings-int-field--wide">
                <span className="settings-int-label">Nombre</span>
                <input className="chat-input" value={name} onChange={(e) => setName(e.target.value)} required />
                <span className="settings-int-hint">Nombre que verán los administradores en listados y acciones.</span>
              </label>
              <div className="settings-int-field settings-int-field--narrow">
                <span className="settings-int-label">Estado</span>
                <span className="settings-int-active-row">
                  <label className="settings-switch" title={isActive ? 'Activa' : 'Inactiva'}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={isActive}
                      aria-label={isActive ? 'Integración activa' : 'Integración inactiva'}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="settings-switch-input"
                    />
                    <span className="settings-switch-visual" aria-hidden />
                  </label>
                  <span>{isActive ? 'Integración activa' : 'Integración inactiva'}</span>
                </span>
              </div>
              <label className="settings-int-field settings-int-field--full">
                <span className="settings-int-label">URL base</span>
                <input className="chat-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
                <span className="settings-int-hint">Prefijo HTTPS del API (sin barra final obligatoria).</span>
              </label>
              <label className="settings-int-field settings-int-field--full">
                <span className="settings-int-label">Notas internas</span>
                <textarea className="chat-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <span className="settings-int-hint">Opcional. Uso interno, no afecta las llamadas.</span>
              </label>
            </div>
          </div>

          <div className="settings-int-form-section">
            <div className="settings-int-form-section-title">Autenticación</div>
            <div className="settings-int-form-grid">
              <label className="settings-int-field settings-int-field--half">
                <span className="settings-int-label">Método</span>
                <select className="chat-input" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                  {AUTH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'none'
                        ? 'Sin autenticación'
                        : t === 'bearer'
                          ? 'Bearer (token)'
                          : t === 'api_key'
                            ? 'Cabecera API key'
                            : 'Basic (usuario y contraseña)'}
                    </option>
                  ))}
                </select>
              </label>
              {authType === 'bearer' ? (
                <label className="settings-int-field settings-int-field--full">
                  <span className="settings-int-label">Token Bearer</span>
                  <input
                    className="chat-input"
                    type="password"
                    autoComplete="off"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder={editingId ? 'Vacío = conservar el token actual' : 'Obligatorio al crear'}
                  />
                </label>
              ) : null}
              {authType === 'api_key' ? (
                <>
                  <label className="settings-int-field settings-int-field--half">
                    <span className="settings-int-label">Nombre de la cabecera</span>
                    <input className="chat-input" value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} />
                  </label>
                  <label className="settings-int-field settings-int-field--half">
                    <span className="settings-int-label">Valor de la clave</span>
                    <input
                      className="chat-input"
                      type="password"
                      autoComplete="off"
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      placeholder={editingId ? 'Vacío = conservar el valor actual' : ''}
                    />
                  </label>
                </>
              ) : null}
              {authType === 'basic' ? (
                <>
                  <label className="settings-int-field settings-int-field--half">
                    <span className="settings-int-label">Usuario</span>
                    <input className="chat-input" value={basicUser} onChange={(e) => setBasicUser(e.target.value)} />
                  </label>
                  <label className="settings-int-field settings-int-field--half">
                    <span className="settings-int-label">Contraseña</span>
                    <input
                      className="chat-input"
                      type="password"
                      autoComplete="off"
                      value={basicPass}
                      onChange={(e) => setBasicPass(e.target.value)}
                      placeholder={editingId ? 'Vacío = conservar la contraseña actual' : ''}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <div className="settings-int-form-actions">
            <button type="submit" className="settings-btn" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear integración'}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--small secondary"
              onClick={() => {
                resetForm();
                onPaneChange('list');
              }}
            >
              Volver al listado
            </button>
          </div>
        </form>
      ) : null}

      {pane === 'list' ? (
        <>
          <div className="settings-api-list-head">
            <h3 className="settings-api-list-heading">Conexiones registradas</h3>
            <button
              type="button"
              className="settings-btn settings-btn--small"
              onClick={() => {
                resetForm();
                onPaneChange('new');
              }}
            >
              Nueva integración
            </button>
          </div>
          {loading ? (
            <p className="settings-muted">Cargando…</p>
          ) : rows.length === 0 ? (
            <div className="settings-api-empty-list">
              <p className="settings-muted">No hay integraciones registradas.</p>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  resetForm();
                  onPaneChange('new');
                }}
              >
                Registrar la primera
              </button>
            </div>
          ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>URL</th>
                  <th>Auth</th>
                  <th>Activa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td style={{ wordBreak: 'break-all', maxWidth: '14rem' }}>{r.base_url}</td>
                    <td>{r.auth_type}</td>
                    <td>{r.is_active ? 'Sí' : 'No'}</td>
                    <td>
                      <button type="button" className="settings-btn settings-btn--small" onClick={() => startEdit(r)}>
                        Editar
                      </button>{' '}
                      <button type="button" className="settings-btn settings-btn--small" onClick={() => void onProbe(r.id)}>
                        Probar
                      </button>{' '}
                      <button
                        type="button"
                        className="settings-btn settings-btn--small"
                        onClick={() => openMaskEditor(r)}
                        title="Tras «Probar», active o desactive cada campo con el interruptor para la vista filtrada"
                      >
                        Campos
                      </button>{' '}
                      <button
                        type="button"
                        className="settings-btn settings-btn--small settings-btn--danger"
                        onClick={() => {
                          if (!window.confirm('¿Eliminar esta integración?')) return;
                          void adminDeleteIntegration(r.id)
                            .then(() => {
                              onMessage('Eliminada');
                              if (editingId === r.id) resetForm();
                              if (maskEditId === r.id) closeMaskEditor();
                              refresh();
                            })
                            .catch((err) =>
                              onMessage(settingsErrorMessage(err, 'No se pudo eliminar.')),
                            );
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {maskEditId
            ? (() => {
                const row = rows.find((x) => x.id === maskEditId);
                if (!row) return null;
                return (
                  <div className="settings-card" style={{ marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Campos JSON — {row.name}</h4>
                    {row.available_fields.length === 0 ? (
                      <p className="settings-muted" style={{ margin: 0 }}>
                        Ejecute «Probar» cuando la API devuelva JSON (objeto o array de objetos) para detectar campos.
                      </p>
                    ) : (
                      <>
                        <p className="settings-muted" style={{ margin: '0 0 10px', fontSize: '0.8125rem' }}>
                          Active el interruptor para incluir el campo en el JSON filtrado; desactívelo para excluirlo.
                        </p>
                        <div className="settings-field-mask-grid" role="group" aria-label="Campos detectados">
                          {row.available_fields.map((field) => {
                            const on = (maskDraft[field] ?? 1) === 1;
                            return (
                              <div key={field} className="settings-field-mask-item">
                                <code className="settings-field-mask-code" title={field}>
                                  {field}
                                </code>
                                <label className="settings-switch" title={on ? 'Incluido' : 'Excluido'}>
                                  <input
                                    type="checkbox"
                                    role="switch"
                                    checked={on}
                                    aria-label={`${field}: incluir en JSON filtrado`}
                                    onChange={(e) => {
                                      const v = e.target.checked ? 1 : 0;
                                      setMaskDraft((prev) => ({ ...prev, [field]: v }));
                                    }}
                                    className="settings-switch-input"
                                  />
                                  <span className="settings-switch-visual" aria-hidden />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          <button
                            type="button"
                            className="settings-btn"
                            disabled={maskSaving}
                            onClick={() => void saveMaskSelection()}
                          >
                            {maskSaving ? 'Guardando…' : 'Guardar selección de campos'}
                          </button>
                          <button type="button" className="settings-btn settings-btn--small secondary" onClick={closeMaskEditor}>
                            Cerrar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            : null}
        </>
      )}
    </>
  ) : null}
    </section>
  );
}

function SettingsUsers({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [page, setPage] = useState(0);
  const take = 30;
  const [data, setData] = useState<{ items: AdminUserRow[]; total: number } | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [deptRoles, setDeptRoles] = useState<DepartmentRoleEntry[]>([]);

  const refresh = useCallback(() => {
    onMessage(null);
    void adminListUsers({ skip: page * take, take }).then(setData);
  }, [onMessage, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) {
      setDeptRoles(selected.department_roles.map((r) => ({ ...r })));
    } else {
      setDeptRoles([]);
    }
  }, [selected]);

  async function saveGlobalRole() {
    if (!selected) return;
    const sel = document.getElementById('user-global-role') as HTMLSelectElement | null;
    const v = sel?.value ?? '';
    const gr = v === '' ? null : (v as 'admin' | 'auditor');
    try {
      await adminUpdateUserGlobalRole(selected.id, gr);
      onMessage('Rol global actualizado');
      refresh();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function saveDeptRoles() {
    if (!selected) return;
    try {
      await adminSetUserDepartmentRoles(selected.id, deptRoles);
      onMessage('Roles por departamento guardados');
      refresh();
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  function updateDeptRow(i: number, field: 'department_id' | 'role', value: string) {
    setDeptRoles((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  return (
    <section className="settings-stack">
      <h2>Usuarios y roles</h2>
      <div className="settings-users-layout">
        <div>
          <button type="button" className="settings-btn settings-btn--small" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>
            Anterior
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--small"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data || (page + 1) * take >= data.total}
          >
            Siguiente
          </button>
          {data ? (
            <span className="settings-muted">
              {' '}
              {data.total} usuarios (página {page + 1})
            </span>
          ) : null}
          <table className="settings-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>ID</th>
                <th>Rol global</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr
                  key={u.id}
                  className={selected?.id === u.id ? 'settings-row-active' : undefined}
                  onClick={() => setSelected(u)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(u)}
                  role="button"
                  tabIndex={0}
                >
                  <td>{u.name}</td>
                  <td>{u.employee_id}</td>
                  <td>{u.global_role ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="settings-card">
          {selected ? (
            <>
              <h3>{selected.name}</h3>
              <p className="settings-muted">{selected.email ?? 'sin correo'}</p>
              <label className="settings-field">
                Rol global
                <select id="user-global-role" className="chat-input" defaultValue={selected.global_role ?? ''}>
                  <option value="">(ninguno)</option>
                  <option value="admin">admin</option>
                  <option value="auditor">auditor</option>
                </select>
              </label>
              <button type="button" className="settings-btn" onClick={() => void saveGlobalRole()}>
                Guardar rol global
              </button>
              <h4>Roles por departamento</h4>
              {deptRoles.map((r, i) => (
                <div key={i} className="settings-form settings-form--grid">
                  <input
                    className="chat-input"
                    value={r.department_id}
                    onChange={(e) => updateDeptRow(i, 'department_id', e.target.value)}
                    placeholder="department_id (UUID)"
                  />
                  <input
                    className="chat-input"
                    value={r.role}
                    onChange={(e) => updateDeptRow(i, 'role', e.target.value)}
                    placeholder="supervisor | tecnico_area"
                  />
                </div>
              ))}
              <button type="button" className="settings-btn settings-btn--small" onClick={() => setDeptRoles((p) => [...p, { department_id: '', role: 'tecnico_area' }])}>
                Añadir fila
              </button>
              <button type="button" className="settings-btn" onClick={() => void saveDeptRoles()}>
                Guardar roles departamento
              </button>
            </>
          ) : (
            <p className="settings-muted">Selecciona un usuario en la tabla.</p>
          )}
        </div>
      </div>
    </section>
  );
}
