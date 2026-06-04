import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ApiError,
  canWriteInventoryForDepartment,
  createInventoryAsset,
  downloadInventoryExport,
  filterDepartmentsForInventory,
  getCurrentUserProfile,
  getInventoryAssetPhotoUrl,
  getTicketDepartments,
  isGlobalAdminRole,
  listInventoryAssets,
  listInventoryDependencies,
  normalizeGlobalRole,
  softDeleteInventoryAsset,
  type CurrentUserProfile,
  type InventoryAssetRow,
  type InventoryDependencyOption,
  type TicketDepartmentOption,
  updateInventoryAsset,
  uploadInventoryAssetPhoto,
} from '../../lib/api';
import { authGet } from '../../lib/authStorage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { InventoryAssetModal } from './components/InventoryAssetModal';
import { InventoryGenericTable } from './components/InventoryGenericTable';
import { InventoryPcApiShell } from './components/InventoryPcApiShell';
import { InventoryPcSubnav } from './components/InventoryPcSubnav';
import { InventorySubnav } from './components/InventorySubnav';
import { InventoryToolbar } from './components/InventoryToolbar';
import {
  DEPARTMENTS_BASE,
  isMantenimientoDepartment,
  usesBdHojaDeVidaBlankCanvas,
} from '../departments/departmentExperience';
import {
  CATEGORY_TITLE,
  SLUG_TO_CATEGORY,
  dStr,
  emptyPcForm,
  pcFormFromDetails,
  pcFormToDetails,
} from './inventoryHelpers';
import { getMergedChecklists } from './inventoryPcChecklists';

export function InventoryHojaDeVidaPage() {
  const { pathname } = useLocation();
  const { departmentId = '', categorySlug = 'pc' } = useParams<{
    departmentId: string;
    categorySlug: string;
  }>();

  const isBdHojaDeVidaRoute = pathname.includes('/bd-hoja-de-vida');
  const apiCategory = SLUG_TO_CATEGORY[categorySlug] ?? 'pc';
  const title = CATEGORY_TITLE[apiCategory] ?? 'Inventario';

  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [deptList, setDeptList] = useState<TicketDepartmentOption[]>([]);
  const [assets, setAssets] = useState<InventoryAssetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [depsCatalog, setDepsCatalog] = useState<InventoryDependencyOption[]>([]);

  const [modal, setModal] = useState<'create' | 'edit' | 'view' | null>(null);
  const [editing, setEditing] = useState<InventoryAssetRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formMfg, setFormMfg] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [pcForm, setPcForm] = useState(emptyPcForm());
  const [simpleDetails, setSimpleDetails] = useState<Record<string, string>>({});
  const [photoHint, setPhotoHint] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InventoryAssetRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [checklistRev, setChecklistRev] = useState(0);

  const canWrite = canWriteInventoryForDepartment(profile, departmentId);
  const departmentName = deptList.find((d) => d.id === departmentId)?.name ?? '';
  const mantenimientoFocus = isMantenimientoDepartment(departmentName);
  const mantenimientoBlankCanvas = usesBdHojaDeVidaBlankCanvas(departmentId, departmentName) && isBdHojaDeVidaRoute;

  const pcChecklists = useMemo(() => getMergedChecklists(), [checklistRev]);

  useEffect(() => {
    const fn = () => setChecklistRev((n) => n + 1);
    window.addEventListener('inventory-pc-checklists-changed', fn);
    return () => window.removeEventListener('inventory-pc-checklists-changed', fn);
  }, []);

  const allowedHere = useMemo(() => {
    if (!profile || !departmentId) return false;
    const gr = normalizeGlobalRole(profile.global_role);
    if (isGlobalAdminRole(profile.global_role) || gr === 'auditor') {
      return true;
    }
    const f = filterDepartmentsForInventory(profile, deptList);
    return f.some((d) => d.id === departmentId);
  }, [profile, deptList, departmentId]);

  const loadAssets = useCallback(
    async (signal?: AbortSignal) => {
      if (!departmentId) return;
      setLoading(true);
      setError('');
      try {
        const res = await listInventoryAssets(departmentId, {
          category: apiCategory,
          search: searchQuery,
          page,
          limit,
          includeInactive,
          signal,
        });
        if (signal?.aborted) return;
        setAssets(res.data);
        setTotal(res.total);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (e instanceof ApiError) {
          if (e.status === 404) {
            setError(
              'El servidor no reconoce el módulo de inventario (404). En la carpeta apps/api ejecute: npm run build y reinicie la API; compruebe en http://localhost:3030/api/v1/docs que exista el tag «inventory».',
            );
          } else if (e.status === 401) {
            setError('Sesión no válida o expirada. Cierre sesión y vuelva a entrar.');
          } else {
            setError(e.message);
          }
        } else {
          setError('Error al cargar activos');
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [departmentId, apiCategory, searchQuery, page, limit, includeInactive],
  );

  useEffect(() => {
    let cancelled = false;
    const token = authGet('access_token');
    if (!token) {
      setProfile(null);
      setDeptList([]);
      setAuthChecked(true);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const p = await getCurrentUserProfile();
        if (cancelled) return;
        setProfile(p);
        try {
          const d = await getTicketDepartments();
          if (!cancelled) setDeptList(d);
        } catch {
          if (!cancelled) setDeptList([]);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setDeptList([]);
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!departmentId || !allowedHere || apiCategory === 'pc') return;
    void listInventoryDependencies(departmentId)
      .then(setDepsCatalog)
      .catch(() => setDepsCatalog([]));
  }, [departmentId, allowedHere, apiCategory]);

  useEffect(() => {
    if (apiCategory === 'pc') return;
    const t = window.setTimeout(() => setSearchQuery(searchInput), 350);
    return () => window.clearTimeout(t);
  }, [searchInput, apiCategory]);

  useEffect(() => {
    if (apiCategory === 'pc') return;
    setPage(1);
  }, [searchQuery, includeInactive, apiCategory]);

  useEffect(() => {
    if (apiCategory !== 'pc') return;
    setAssets([]);
    setTotal(0);
    setError('');
    setLoading(false);
    setSearchInput('');
    setSearchQuery('');
    setIncludeInactive(false);
    setPage(1);
  }, [apiCategory, departmentId]);

  useEffect(() => {
    if (!allowedHere || apiCategory === 'pc') return;
    const ac = new AbortController();
    void loadAssets(ac.signal);
    return () => ac.abort();
  }, [allowedHere, loadAssets, apiCategory]);

  useEffect(() => {
    if (!editing?.id || modal !== 'edit') {
      setPhotoPreview(null);
      return;
    }
    void getInventoryAssetPhotoUrl(editing.id)
      .then((r) => setPhotoPreview(r.photoUrl))
      .catch(() => setPhotoPreview(null));
  }, [editing?.id, modal]);

  function openCreate() {
    setPhotoHint('');
    setEditing(null);
    setFormName('');
    setFormSerial('');
    setFormMfg('');
    setFormActive(true);
    setPcForm(emptyPcForm());
    setSimpleDetails({
      ubicacion: '',
      ip: '',
      ip_gestion: '',
      estado: '',
      responsable: '',
      comentario: '',
      marca: '',
      modelo: '',
      tipo: '',
      tipo_libre: '',
      mac: '',
    });
    setModal('create');
  }

  function openView(row: InventoryAssetRow) {
    setPhotoHint('');
    setEditing(row);
    setFormName(row.name);
    setFormSerial(row.serialNumber ?? '');
    setFormMfg(row.manufacturerSerial ?? '');
    setFormActive(row.isActive);
    const d = row.details ?? {};
    if (apiCategory === 'pc') setPcForm(pcFormFromDetails(d as Record<string, unknown>));
    setModal('view');
  }

  function openEdit(row: InventoryAssetRow) {
    setPhotoHint('');
    setEditing(row);
    setFormName(row.name);
    setFormSerial(row.serialNumber ?? '');
    setFormMfg(row.manufacturerSerial ?? '');
    setFormActive(row.isActive);
    const d = row.details ?? {};
    if (apiCategory === 'pc') setPcForm(pcFormFromDetails(d as Record<string, unknown>));
    else {
      setSimpleDetails({
        ubicacion: dStr(d as Record<string, unknown>, 'ubicacion'),
        ip: dStr(d as Record<string, unknown>, 'ip'),
        ip_gestion: dStr(d as Record<string, unknown>, 'ip_gestion'),
        estado: dStr(d as Record<string, unknown>, 'estado'),
        responsable: dStr(d as Record<string, unknown>, 'responsable'),
        comentario: dStr(d as Record<string, unknown>, 'comentario'),
        marca: dStr(d as Record<string, unknown>, 'marca'),
        modelo: dStr(d as Record<string, unknown>, 'modelo'),
        tipo: dStr(d as Record<string, unknown>, 'tipo'),
        tipo_libre: dStr(d as Record<string, unknown>, 'tipo_libre'),
        mac: dStr(d as Record<string, unknown>, 'mac'),
      });
    }
    setModal('edit');
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!departmentId || !canWrite) return;
    setError('');
    setSaving(true);
    try {
      if (modal === 'create') {
        let details: Record<string, unknown> = {};
        if (apiCategory === 'pc') details = pcFormToDetails(pcForm);
        else {
          Object.entries(simpleDetails).forEach(([k, v]) => {
            const t = v.trim();
            if (t) details[k] = t;
          });
        }
        await createInventoryAsset(departmentId, {
          equipmentCategory: apiCategory,
          name: formName.trim(),
          serialNumber: formSerial.trim() || null,
          manufacturerSerial: formMfg.trim() || null,
          details,
          isActive: formActive,
        });
      } else if (modal === 'edit' && editing) {
        let details: Record<string, unknown> | undefined;
        if (apiCategory === 'pc') details = pcFormToDetails(pcForm);
        else {
          details = {};
          Object.entries(simpleDetails).forEach(([k, v]) => {
            const t = v.trim();
            details![k] = t || null;
          });
        }
        await updateInventoryAsset(editing.id, {
          name: formName.trim(),
          serialNumber: formSerial.trim() || null,
          manufacturerSerial: formMfg.trim() || null,
          details,
          isActive: formActive,
        });
      }
      setModal(null);
      await loadAssets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(row: InventoryAssetRow) {
    if (!canWrite) return;
    setPendingDelete(row);
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row || !canWrite) return;
    setPendingDelete(null);
    try {
      await softDeleteInventoryAsset(row.id);
      await loadAssets();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar');
    }
  }

  async function onExport() {
    try {
      const blob = await downloadInventoryExport(departmentId, {
        category: apiCategory,
        search: searchQuery,
        includeInactive,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-${apiCategory}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al exportar');
    }
  }

  function onDependencyPick(legacyId: string) {
    if (!legacyId) {
      setPcForm((p) => ({ ...p, dependency_id: '', dependency_name: '' }));
      return;
    }
    const row = depsCatalog.find((d) => String(d.legacyId) === legacyId);
    setPcForm((p) => ({
      ...p,
      dependency_id: legacyId,
      dependency_name: row?.name ?? p.dependency_name,
    }));
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
  }

  function onPhotoFile(f: File) {
    if (!editing) return;
    setPhotoHint('Subiendo…');
    void uploadInventoryAssetPhoto(editing.id, f)
      .then((r) => {
        setPhotoPreview(r.photoUrl);
        setPhotoHint('Imagen actualizada.');
      })
      .catch((err) =>
        setPhotoHint(err instanceof ApiError ? err.message : 'Error al subir'),
      );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const showEmpty = !loading && assets.length === 0;

  if (!authChecked) {
    return (
      <section className="module-card">
        <p>Comprobando sesión y permisos…</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="module-card">
        <p className="error">
          No se pudo cargar su perfil (sesión expirada o sin autorización). Vuelva a{' '}
          <Link to="/login">iniciar sesión</Link>.
        </p>
        <Link to={DEPARTMENTS_BASE}>Volver a departamentos</Link>
      </section>
    );
  }

  if (!allowedHere) {
    return (
      <section className="module-card">
        <p>No tiene acceso a este departamento.</p>
        <Link to={DEPARTMENTS_BASE}>Volver</Link>
      </section>
    );
  }

  return (
    <section className="inventory-page">
      {!mantenimientoBlankCanvas ? (
        <InventorySubnav departmentId={departmentId} departmentName={departmentName} />
      ) : null}
      {apiCategory === 'pc' && !mantenimientoFocus && !mantenimientoBlankCanvas ? (
        <InventoryPcSubnav departmentId={departmentId} />
      ) : null}

      <div
        className={
          mantenimientoBlankCanvas
            ? 'module-card inventory-card inventory-card--blank-canvas'
            : 'module-card inventory-card'
        }
      >
        {mantenimientoBlankCanvas ? (
          <div className="inventory-dept-canvas" aria-label="Área de trabajo del departamento" />
        ) : apiCategory === 'pc' ? (
          <InventoryPcApiShell
            departmentId={departmentId}
            departmentName={departmentName || '—'}
            showAdminSettingsLink={profile ? isGlobalAdminRole(profile.global_role) : false}
            compact={mantenimientoFocus}
          />
        ) : (
          <>
            <header className="inventory-page-header">
              <div>
                <h2 className="inventory-page-title">{title}</h2>
                <p className="inventory-breadcrumb">
                  <span className="inventory-breadcrumb__muted">Inventario</span>
                  <span aria-hidden> / </span>
                  <span>{title}</span>
                </p>
              </div>
            </header>

            <InventoryToolbar
              departmentId={departmentId}
              searchInput={searchInput}
              onSearchChange={setSearchInput}
              includeInactive={includeInactive}
              onIncludeInactiveChange={setIncludeInactive}
              onExport={() => void onExport()}
              canWrite={canWrite}
              onCreate={openCreate}
              variant="default"
            />

            {error ? (
              <div className="inventory-alert inventory-alert--error" role="alert">
                {error}
              </div>
            ) : null}

            <div className={`inventory-table-wrap${loading ? ' inventory-table-wrap--loading' : ''}`}>
              {loading ? (
                <div className="inventory-table-overlay" aria-busy="true" aria-label="Cargando datos">
                  <div className="inventory-spinner" />
                  <span className="inventory-table-overlay__text">Cargando…</span>
                </div>
              ) : null}

              {showEmpty ? (
                <div className="inventory-empty">
                  <p className="inventory-empty__title">No hay equipos en esta categoría</p>
                  <p className="inventory-empty__hint">
                    Ajuste la búsqueda, incluya dados de baja o registre un equipo nuevo.
                  </p>
                  {canWrite ? (
                    <button type="button" className="inventory-btn inventory-btn--primary" onClick={openCreate}>
                      Registrar equipo
                    </button>
                  ) : null}
                </div>
              ) : (
                <InventoryGenericTable
                  assets={assets}
                  apiCategory={apiCategory}
                  canWrite={canWrite}
                  onView={openView}
                  onEdit={openEdit}
                  onDelete={requestDelete}
                />
              )}
            </div>

            <footer className="inventory-footer">
              <p className="inventory-footer__meta">
                Total: {total}. Página {page} de {totalPages}.
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
          </>
        )}
      </div>

      {modal ? (
        <InventoryAssetModal
          modal={modal}
          onClose={closeModal}
          onSubmit={onSubmitForm}
          saving={saving}
          apiCategory={apiCategory}
          canWrite={canWrite}
          depsCatalog={depsCatalog}
          pcChecklists={pcChecklists}
          showAdminInventorySettings={profile ? isGlobalAdminRole(profile.global_role) : false}
          editing={editing}
          formName={formName}
          setFormName={setFormName}
          formSerial={formSerial}
          setFormSerial={setFormSerial}
          formMfg={formMfg}
          setFormMfg={setFormMfg}
          formActive={formActive}
          setFormActive={setFormActive}
          pcForm={pcForm}
          setPcForm={setPcForm}
          onDependencyPick={onDependencyPick}
          simpleDetails={simpleDetails}
          setSimpleDetails={setSimpleDetails}
          photoPreview={photoPreview}
          photoHint={photoHint}
          onPhotoFile={onPhotoFile}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Dar de baja"
        message={
          pendingDelete
            ? `¿Dar de baja lógica el activo ${pendingDelete.serialNumber ?? pendingDelete.name}?`
            : ''
        }
        confirmLabel="Dar de baja"
        cancelLabel="Cancelar"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
