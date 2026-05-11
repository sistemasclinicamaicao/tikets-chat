import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InventoryAssetRow, InventoryDependencyOption } from '../../../lib/api';
import { dStr, legacyDateToInputValue, oneLine, type PcDetailForm } from '../inventoryHelpers';
import type { PcChecklistKey } from '../inventoryPcChecklists';
import { InventoryPcChecklistForm } from './InventoryPcChecklistForm';

type SimpleDetails = Record<string, string>;

type Props = {
  modal: 'create' | 'edit' | 'view';
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  saving: boolean;
  apiCategory: string;
  canWrite: boolean;
  depsCatalog: InventoryDependencyOption[];
  /** Listas sugeridas (datalist) para campos tipo checklist */
  pcChecklists: Record<PcChecklistKey, string[]>;
  /** Enlace a Ajustes → Inventario PC (solo administradores globales) */
  showAdminInventorySettings?: boolean;
  editing: InventoryAssetRow | null;
  formName: string;
  setFormName: (v: string) => void;
  formSerial: string;
  setFormSerial: (v: string) => void;
  formMfg: string;
  setFormMfg: (v: string) => void;
  formActive: boolean;
  setFormActive: (v: boolean) => void;
  pcForm: PcDetailForm;
  setPcForm: Dispatch<SetStateAction<PcDetailForm>>;
  onDependencyPick: (legacyId: string) => void;
  simpleDetails: SimpleDetails;
  setSimpleDetails: Dispatch<SetStateAction<SimpleDetails>>;
  photoPreview: string | null;
  photoHint: string;
  onPhotoFile: (file: File) => void;
};

function DefBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inventory-modal__section inventory-modal__section--panel">
      <h3 className="inventory-modal__section-title">{title}</h3>
      <dl className="inventory-modal__dl inventory-modal__dl--grid">{children}</dl>
    </section>
  );
}

function DefRow({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  const display = value.trim() ? value : '—';
  return (
    <div
      className={`inventory-detail-row${fullWidth ? ' inventory-detail-row--full' : ''}`}
    >
      <dt>{label}</dt>
      <dd>{display}</dd>
    </div>
  );
}

function PcViewBody({ row }: { row: InventoryAssetRow }) {
  const d = row.details ?? {};
  return (
    <>
      <DefBlock title="Identificación">
        <DefRow label="Nombre" value={row.name} />
        <DefRow label="Código inventario" value={row.serialNumber ?? ''} />
        <DefRow label="Serial fabricante" value={row.manufacturerSerial ?? ''} />
        <DefRow label="Activo" value={row.isActive ? 'Sí' : 'No (baja)'} />
        <DefRow label="Dependencia" value={dStr(d, 'dependency_name')} />
      </DefBlock>
      <DefBlock title="Ubicación y red">
        <DefRow label="IP" value={oneLine(dStr(d, 'dir_ip'))} />
        <DefRow label="Usuario" value={dStr(d, 'usuario')} />
        <DefRow label="MAC" value={oneLine(dStr(d, 'mac'))} />
      </DefBlock>
      <DefBlock title="Hardware y sistema">
        <DefRow label="F. adquisición" value={dStr(d, 'fecha_adquisicion')} />
        <DefRow label="Marca" value={dStr(d, 'marca')} />
        <DefRow label="Modelo" value={dStr(d, 'modelo')} />
        <DefRow label="Procesador" value={dStr(d, 'procesador')} />
        <DefRow label="Tipo almacenamiento" value={dStr(d, 'tp_almacenamiento')} />
        <DefRow label="Tamaño disco" value={dStr(d, 'tam_disco')} />
        <DefRow label="Tarjeta gráfica" value={dStr(d, 'tarjeta_grafica')} />
        <DefRow label="F. instalación SO" value={dStr(d, 'fecha_instalacion')} />
        <DefRow label="Tipo RAM" value={dStr(d, 'tp_ram')} />
        <DefRow label="RAM" value={dStr(d, 'ram')} />
        <DefRow label="Monitor" value={dStr(d, 'monitor')} />
        <DefRow label="Sistema operativo" value={dStr(d, 'sis_operativo')} />
        <DefRow label="Versión SO" value={dStr(d, 'vers_sistema')} />
        <DefRow label="Software crítico" value={dStr(d, 'desc_programa')} fullWidth />
        <DefRow label="Acceso remoto" value={dStr(d, 'remoto')} />
      </DefBlock>
      <DefBlock title="Estado y administración">
        <DefRow label="Estado" value={dStr(d, 'estado_actual')} />
        <DefRow label="Motivo inactividad" value={dStr(d, 'motivo_inactividad')} fullWidth />
        <DefRow label="Responsable" value={dStr(d, 'resp_equipo')} />
        <DefRow label="Licencia Office" value={dStr(d, 'licencia_of')} />
        <DefRow label="Fecha licencia" value={dStr(d, 'fecha_instalacion_lic')} />
        <DefRow label="URL imagen (legado)" value={dStr(d, 'image_url')} fullWidth />
        <DefRow label="Comentario" value={dStr(d, 'comentario')} fullWidth />
      </DefBlock>
    </>
  );
}

function OtherViewBody({ row, apiCategory }: { row: InventoryAssetRow; apiCategory: string }) {
  const d = row.details ?? {};
  return (
    <>
      <DefBlock title="Identificación">
        <DefRow label="Nombre" value={row.name} />
        <DefRow label="Código" value={row.serialNumber ?? ''} />
        <DefRow label="Serial fabricante" value={row.manufacturerSerial ?? ''} />
        <DefRow label="En inventario" value={row.isActive ? 'Sí' : 'No (baja)'} />
      </DefBlock>
      <DefBlock title="Detalles">
        {apiCategory === 'printer' ? (
          <>
            <DefRow label="Ubicación" value={dStr(d, 'ubicacion')} />
            <DefRow label="IP" value={dStr(d, 'ip')} />
          </>
        ) : null}
        {apiCategory === 'network' ? (
          <>
            <DefRow label="Tipo" value={dStr(d, 'tipo')} />
            <DefRow label="IP gestión" value={dStr(d, 'ip_gestion')} />
          </>
        ) : null}
        {apiCategory === 'other' ? <DefRow label="Tipo" value={dStr(d, 'tipo_libre')} /> : null}
        <DefRow label="Marca" value={dStr(d, 'marca')} />
        <DefRow label="Modelo" value={dStr(d, 'modelo')} />
        <DefRow label="Estado" value={dStr(d, 'estado')} />
        <DefRow label="Responsable" value={dStr(d, 'responsable')} />
        <DefRow label="MAC" value={oneLine(dStr(d, 'mac'))} />
        <DefRow label="Comentario" value={dStr(d, 'comentario')} fullWidth />
      </DefBlock>
    </>
  );
}

function SimpleField({
  label,
  v,
  onChange,
  readOnly,
}: {
  label: string;
  v: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label>
      {label}
      <input value={v} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />
    </label>
  );
}

function PcDatalistInput({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label>
      {label}
      <input list={id} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

export function InventoryAssetModal(props: Props) {
  const {
    modal,
    onClose,
    onSubmit,
    saving,
    apiCategory,
    canWrite,
    depsCatalog,
    pcChecklists,
    showAdminInventorySettings = false,
    editing,
    formName,
    setFormName,
    formSerial,
    setFormSerial,
    formMfg,
    setFormMfg,
    formActive,
    setFormActive,
    pcForm,
    setPcForm,
    onDependencyPick,
    simpleDetails,
    setSimpleDetails,
    photoPreview,
    photoHint,
    onPhotoFile,
  } = props;

  const [listsEditorOpen, setListsEditorOpen] = useState(false);
  const [listsEditorHint, setListsEditorHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        if (listsEditorOpen) {
          setListsEditorOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving, listsEditorOpen]);

  const title =
    modal === 'create' ? 'Registrar equipo' : modal === 'view' ? 'Detalle de equipo' : 'Editar equipo';

  const isEdit = modal === 'edit';
  const lockLegacyIds = isEdit;

  return (
    <div
      className="employee-profile-modal-backdrop"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <div
        className="employee-profile-modal inventory-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="employee-profile-modal__header inventory-modal__header-sticky">
          <h2 className="employee-profile-modal__title">{title}</h2>
          <button
            type="button"
            className="employee-profile-modal__close"
            onClick={() => !saving && onClose()}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <form className="inventory-modal__form inventory-modal__body" onSubmit={(e) => void onSubmit(e)}>
          {apiCategory === 'pc' && modal === 'view' && editing ? (
            <div className="inventory-modal__scroll">
              <PcViewBody row={editing} />
            </div>
          ) : null}

          {apiCategory !== 'pc' && modal === 'view' && editing ? (
            <div className="inventory-modal__scroll">
              <OtherViewBody row={editing} apiCategory={apiCategory} />
            </div>
          ) : null}

          {apiCategory === 'pc' && modal !== 'view' ? (
            <div className="inventory-modal__scroll">
              <div className="inventory-modal__checklist-hint">
                <p>
                  Campos con <strong>sugerencias</strong> (almacenamiento, RAM, sistema operativo, estado, remoto)
                  admiten texto libre o elegir de la lista. Las dependencias vienen del{' '}
                  <strong>catálogo del departamento</strong> en el servidor (importación / administración de datos).
                </p>
                <p className="inventory-modal__checklist-hint__links">
                  {canWrite ? (
                    <button
                      type="button"
                      className="inventory-modal__link-btn"
                      onClick={() => {
                        setListsEditorHint(null);
                        setListsEditorOpen(true);
                      }}
                    >
                      Editar listas de sugerencias…
                    </button>
                  ) : null}
                  {canWrite && showAdminInventorySettings ? <span aria-hidden> · </span> : null}
                  {showAdminInventorySettings ? (
                    <Link to="/settings?tab=inventory_pc" className="inventory-modal__inline-link">
                      Configuración → Inventario PC
                    </Link>
                  ) : null}
                </p>
              </div>

              <div className="inventory-form-grid inventory-form-grid--pc-modal">
                <label className="inventory-form-grid__span-2">
                  Nombre del computador
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </label>
                <label>
                  Número de serie (código inventario)
                  <input
                    value={formSerial}
                    onChange={(e) => setFormSerial(e.target.value)}
                    readOnly={lockLegacyIds}
                    title={lockLegacyIds ? 'No se modifica el código en edición' : undefined}
                  />
                </label>
                <label className="inventory-toolbar__check inventory-form-grid__check-active">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  Activo en inventario
                </label>

                <label>
                  Serial de fabricante
                  <input
                    value={formMfg}
                    onChange={(e) => setFormMfg(e.target.value)}
                    readOnly={lockLegacyIds}
                    title={lockLegacyIds ? 'No se modifica en edición' : undefined}
                  />
                </label>
                <label>
                  Dirección IP
                  <input
                    value={pcForm.dir_ip}
                    onChange={(e) => setPcForm((p) => ({ ...p, dir_ip: e.target.value }))}
                  />
                </label>
                <label>
                  Dependencia (catálogo)
                  <select value={pcForm.dependency_id} onChange={(e) => onDependencyPick(e.target.value)}>
                    <option value="">— Seleccione —</option>
                    {depsCatalog.map((d) => (
                      <option key={d.id} value={String(d.legacyId)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inventory-form-grid__span-2">
                  Nombre dependencia (texto libre / respaldo)
                  <input
                    value={pcForm.dependency_name}
                    onChange={(e) => setPcForm((p) => ({ ...p, dependency_name: e.target.value }))}
                    placeholder="Si no está en el catálogo, escriba la unidad aquí"
                  />
                </label>

                <label>
                  Usuario
                  <input
                    value={pcForm.usuario}
                    onChange={(e) => setPcForm((p) => ({ ...p, usuario: e.target.value }))}
                  />
                </label>
                <label>
                  Fecha de adquisición
                  <input
                    type={lockLegacyIds ? 'text' : 'date'}
                    value={lockLegacyIds ? pcForm.fecha_adquisicion : legacyDateToInputValue(pcForm.fecha_adquisicion)}
                    onChange={(e) =>
                      setPcForm((p) => ({ ...p, fecha_adquisicion: e.target.value }))
                    }
                    readOnly={lockLegacyIds}
                  />
                </label>
                <label>
                  Marca
                  <input value={pcForm.marca} onChange={(e) => setPcForm((p) => ({ ...p, marca: e.target.value }))} />
                </label>
                <label>
                  Modelo
                  <input value={pcForm.modelo} onChange={(e) => setPcForm((p) => ({ ...p, modelo: e.target.value }))} />
                </label>

                <label className="inventory-form-grid__span-2">
                  Procesador
                  <input
                    value={pcForm.procesador}
                    onChange={(e) => setPcForm((p) => ({ ...p, procesador: e.target.value }))}
                  />
                </label>
                <PcDatalistInput
                  id="pc-dl-tp_almacenamiento"
                  label="Tipo de almacenamiento"
                  value={pcForm.tp_almacenamiento}
                  onChange={(v) => setPcForm((p) => ({ ...p, tp_almacenamiento: v }))}
                  options={pcChecklists.tp_almacenamiento}
                />
                <label>
                  Tamaño del disco
                  <input
                    value={pcForm.tam_disco}
                    onChange={(e) => setPcForm((p) => ({ ...p, tam_disco: e.target.value }))}
                  />
                </label>
                <label>
                  Tarjeta gráfica
                  <input
                    value={pcForm.tarjeta_grafica}
                    onChange={(e) => setPcForm((p) => ({ ...p, tarjeta_grafica: e.target.value }))}
                  />
                </label>
                <label>
                  Fecha de instalación (SO)
                  <input
                    type="date"
                    value={legacyDateToInputValue(pcForm.fecha_instalacion)}
                    onChange={(e) => setPcForm((p) => ({ ...p, fecha_instalacion: e.target.value }))}
                  />
                </label>
                <PcDatalistInput
                  id="pc-dl-tp_ram"
                  label="Tipo de RAM"
                  value={pcForm.tp_ram}
                  onChange={(v) => setPcForm((p) => ({ ...p, tp_ram: v }))}
                  options={pcChecklists.tp_ram}
                />
                <PcDatalistInput
                  id="pc-dl-ram"
                  label="RAM"
                  value={pcForm.ram}
                  onChange={(v) => setPcForm((p) => ({ ...p, ram: v }))}
                  options={pcChecklists.ram}
                />
                <label>
                  Monitor
                  <input
                    value={pcForm.monitor}
                    onChange={(e) => setPcForm((p) => ({ ...p, monitor: e.target.value }))}
                  />
                </label>
                <PcDatalistInput
                  id="pc-dl-sis_operativo"
                  label="Sistema operativo"
                  value={pcForm.sis_operativo}
                  onChange={(v) => setPcForm((p) => ({ ...p, sis_operativo: v }))}
                  options={pcChecklists.sis_operativo}
                />
                <label>
                  Versión del sistema operativo
                  <input
                    value={pcForm.vers_sistema}
                    onChange={(e) => setPcForm((p) => ({ ...p, vers_sistema: e.target.value }))}
                  />
                </label>
                <label className="inventory-form-grid__span-2">
                  Descripción del programa / software crítico
                  <input
                    value={pcForm.desc_programa}
                    onChange={(e) => setPcForm((p) => ({ ...p, desc_programa: e.target.value }))}
                  />
                </label>
                <PcDatalistInput
                  id="pc-dl-remoto"
                  label="Remoto"
                  value={pcForm.remoto}
                  onChange={(v) => setPcForm((p) => ({ ...p, remoto: v }))}
                  options={pcChecklists.remoto}
                />
                <PcDatalistInput
                  id="pc-dl-estado_actual"
                  label="Estado actual"
                  value={pcForm.estado_actual}
                  onChange={(v) => setPcForm((p) => ({ ...p, estado_actual: v }))}
                  options={pcChecklists.estado_actual}
                />
                <label className="inventory-form-grid__span-2">
                  Motivo de inactividad
                  <input
                    value={pcForm.motivo_inactividad}
                    onChange={(e) => setPcForm((p) => ({ ...p, motivo_inactividad: e.target.value }))}
                  />
                </label>
                <label className="inventory-form-grid__span-2">
                  Responsable del equipo
                  <input
                    value={pcForm.resp_equipo}
                    onChange={(e) => setPcForm((p) => ({ ...p, resp_equipo: e.target.value }))}
                  />
                </label>

                <label className="inventory-form-grid__span-full">
                  Comentario
                  <textarea
                    rows={3}
                    value={pcForm.comentario}
                    onChange={(e) => setPcForm((p) => ({ ...p, comentario: e.target.value }))}
                  />
                </label>
                <label>
                  Licencia (Office / otro)
                  <input
                    value={pcForm.licencia_of}
                    onChange={(e) => setPcForm((p) => ({ ...p, licencia_of: e.target.value }))}
                    placeholder="Ingrese licencia"
                  />
                </label>
                <label>
                  Fecha de instalación licencia
                  <input
                    type="date"
                    value={legacyDateToInputValue(pcForm.fecha_instalacion_lic)}
                    onChange={(e) => setPcForm((p) => ({ ...p, fecha_instalacion_lic: e.target.value }))}
                  />
                </label>
                <label>
                  MAC
                  <input value={pcForm.mac} onChange={(e) => setPcForm((p) => ({ ...p, mac: e.target.value }))} />
                </label>
                <label className="inventory-form-grid__span-full">
                  URL imagen (legado)
                  <input
                    value={pcForm.image_url}
                    onChange={(e) => setPcForm((p) => ({ ...p, image_url: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {apiCategory !== 'pc' && modal !== 'view' ? (
            <div className="inventory-modal__scroll">
              <label>
                Nombre
                <input value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </label>
              <label>
                Código inventario
                <input value={formSerial} onChange={(e) => setFormSerial(e.target.value)} />
              </label>
              <label>
                Serial fabricante
                <input value={formMfg} onChange={(e) => setFormMfg(e.target.value)} />
              </label>
              <label className="inventory-toolbar__check">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Activo en inventario
              </label>
              <div className="inventory-form-grid">
                {apiCategory === 'printer' ? (
                  <>
                    <SimpleField
                      label="Ubicación"
                      v={simpleDetails.ubicacion ?? ''}
                      onChange={(v) => setSimpleDetails((s) => ({ ...s, ubicacion: v }))}
                    />
                    <SimpleField
                      label="IP"
                      v={simpleDetails.ip ?? ''}
                      onChange={(v) => setSimpleDetails((s) => ({ ...s, ip: v }))}
                    />
                  </>
                ) : null}
                {apiCategory === 'network' ? (
                  <>
                    <SimpleField
                      label="Tipo"
                      v={simpleDetails.tipo ?? ''}
                      onChange={(v) => setSimpleDetails((s) => ({ ...s, tipo: v }))}
                    />
                    <SimpleField
                      label="IP gestión"
                      v={simpleDetails.ip_gestion ?? ''}
                      onChange={(v) => setSimpleDetails((s) => ({ ...s, ip_gestion: v }))}
                    />
                  </>
                ) : null}
                {apiCategory === 'other' ? (
                  <SimpleField
                    label="Tipo"
                    v={simpleDetails.tipo_libre ?? ''}
                    onChange={(v) => setSimpleDetails((s) => ({ ...s, tipo_libre: v }))}
                  />
                ) : null}
                <SimpleField
                  label="Marca"
                  v={simpleDetails.marca ?? ''}
                  onChange={(v) => setSimpleDetails((s) => ({ ...s, marca: v }))}
                />
                <SimpleField
                  label="Modelo"
                  v={simpleDetails.modelo ?? ''}
                  onChange={(v) => setSimpleDetails((s) => ({ ...s, modelo: v }))}
                />
                <SimpleField
                  label="Estado"
                  v={simpleDetails.estado ?? ''}
                  onChange={(v) => setSimpleDetails((s) => ({ ...s, estado: v }))}
                />
                <SimpleField
                  label="Responsable"
                  v={simpleDetails.responsable ?? ''}
                  onChange={(v) => setSimpleDetails((s) => ({ ...s, responsable: v }))}
                />
                <label style={{ gridColumn: '1 / -1' }}>
                  Comentario
                  <textarea
                    rows={2}
                    value={simpleDetails.comentario ?? ''}
                    onChange={(e) => setSimpleDetails((s) => ({ ...s, comentario: e.target.value }))}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {modal === 'edit' && canWrite && editing ? (
            <div className="inventory-photo-block">
              <p>
                <strong>Cargar imagen del equipo</strong>
              </p>
              {photoPreview ? (
                <img src={photoPreview} alt="" className="inventory-photo-preview" />
              ) : (
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Sin foto en almacenamiento.</p>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPhotoFile(f);
                }}
              />
              {photoHint ? <p className="hint">{photoHint}</p> : null}
            </div>
          ) : null}

          <div className="inventory-modal__actions inventory-modal__footer-sticky">
            <button type="button" className="secondary" disabled={saving} onClick={onClose}>
              {modal === 'view' ? 'Cerrar' : 'Cancelar'}
            </button>
            {modal !== 'view' && canWrite ? (
              <button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
              </button>
            ) : null}
          </div>
        </form>

        {listsEditorOpen ? (
          <div
            className="inventory-nested-dialog-backdrop"
            role="presentation"
            onClick={() => !saving && setListsEditorOpen(false)}
          >
            <div
              className="inventory-nested-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inventory-pc-lists-title"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="inventory-nested-dialog__head">
                <h3 id="inventory-pc-lists-title">Listas de sugerencias (PC)</h3>
                <button
                  type="button"
                  className="employee-profile-modal__close"
                  aria-label="Cerrar"
                  onClick={() => setListsEditorOpen(false)}
                >
                  ×
                </button>
              </header>
              {listsEditorHint ? <p className="inventory-nested-dialog__hint">{listsEditorHint}</p> : null}
              <div className="inventory-nested-dialog__body">
                <InventoryPcChecklistForm
                  onMessage={(m) => {
                    setListsEditorHint(m);
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
