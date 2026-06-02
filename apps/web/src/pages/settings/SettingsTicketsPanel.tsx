import { FormEvent, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  adminCreateDepartment,
  adminCreateTicketPriority,
  adminCreateTicketStatus,
  adminDeleteTicketPriority,
  adminDeleteTicketStatus,
  adminListDepartments,
  adminListTicketPriorities,
  adminListTicketStatuses,
  adminUpdateDepartment,
  type AdminDepartmentRow,
  type AdminTicketPriorityRow,
  type AdminTicketStatusRow,
} from '../../lib/api';
import { SettingsMasterDetail } from './SettingsMasterDetail';
import { SettingsSectionCard } from './SettingsSectionCard';
import { SettingsSubTabs } from './SettingsSubTabs';
import { etiquetaCategoriaEstado, selectableRowProps, settingsErrorMessage } from './settingsUtils';

type TicketsSubTab = 'departments' | 'statuses' | 'priorities';

const TICKETS_TABS = [
  { id: 'departments' as const, label: 'Departamentos' },
  { id: 'statuses' as const, label: 'Estados' },
  { id: 'priorities' as const, label: 'Prioridades' },
];

type DeptFormState = {
  name: string;
  description: string;
  assetInventoryCodeExample: string;
  assetInventoryCodePattern: string;
};

function emptyDeptForm(): DeptFormState {
  return {
    name: '',
    description: '',
    assetInventoryCodeExample: '',
    assetInventoryCodePattern: '',
  };
}

function deptToForm(d: AdminDepartmentRow): DeptFormState {
  return {
    name: d.name,
    description: d.description ?? '',
    assetInventoryCodeExample: d.assetInventoryCodeExample ?? '',
    assetInventoryCodePattern: d.assetInventoryCodePattern ?? '',
  };
}

export function SettingsTicketsPanel({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [subTab, setSubTab] = useState<TicketsSubTab>('departments');
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [statuses, setStatuses] = useState<AdminTicketStatusRow[]>([]);
  const [priorities, setPriorities] = useState<AdminTicketPriorityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState<DeptFormState>(emptyDeptForm);
  const [savingDept, setSavingDept] = useState(false);

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === selectedDeptId) ?? null,
    [departments, selectedDeptId],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    onMessage(null);
    void Promise.all([adminListDepartments(), adminListTicketStatuses(), adminListTicketPriorities()])
      .then(([d, s, p]) => {
        setDepartments(d);
        setStatuses(s);
        setPriorities(p);
        setSelectedDeptId((prev) => {
          if (prev && d.some((row) => row.id === prev)) return prev;
          const firstActive = d.find((row) => row.isActive);
          return firstActive?.id ?? d[0]?.id ?? null;
        });
      })
      .catch((e) => onMessage(settingsErrorMessage(e, 'Error al cargar catálogos.')))
      .finally(() => setLoading(false));
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedDept) {
      setDeptForm(deptToForm(selectedDept));
    } else {
      setDeptForm(emptyDeptForm());
    }
  }, [selectedDept?.id, selectedDept?.updatedAt]);

  async function addDepartment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      const created = await adminCreateDepartment({
        name,
        description: String(fd.get('description') ?? '').trim() || undefined,
      });
      onMessage('Departamento creado');
      setSelectedDeptId(created.id);
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo crear el departamento.'));
    }
  }

  async function toggleDept(d: AdminDepartmentRow, e: MouseEvent) {
    e.stopPropagation();
    try {
      await adminUpdateDepartment(d.id, { is_active: !d.isActive });
      onMessage(d.isActive ? 'Departamento desactivado' : 'Departamento activado');
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo cambiar el estado del departamento.'));
    }
  }

  async function saveSelectedDept(e: FormEvent) {
    e.preventDefault();
    if (!selectedDeptId) return;
    setSavingDept(true);
    try {
      await adminUpdateDepartment(selectedDeptId, {
        name: deptForm.name.trim(),
        description: deptForm.description.trim() || null,
        asset_inventory_code_example: deptForm.assetInventoryCodeExample.trim() || null,
        asset_inventory_code_pattern: deptForm.assetInventoryCodePattern.trim() || null,
      });
      onMessage('Departamento guardado');
      refresh();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo guardar el departamento.'));
    } finally {
      setSavingDept(false);
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
      onMessage(settingsErrorMessage(err, 'No se pudo crear el estado.'));
    }
  }

  async function addPriority(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateTicketPriority({
        code: String(fd.get('code') ?? '').trim(),
        name: String(fd.get('name') ?? '').trim(),
        response_minutes: fd.get('response_minutes') ? Number(fd.get('response_minutes')) : null,
        resolution_minutes: fd.get('resolution_minutes') ? Number(fd.get('resolution_minutes')) : null,
      });
      onMessage('Prioridad creada');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo crear la prioridad.'));
    }
  }

  if (loading) return <p>Cargando catálogos…</p>;

  return (
    <section className="settings-stack">
      <h2>Tickets — catálogos</h2>
      <SettingsSubTabs
        tabs={TICKETS_TABS}
        active={subTab}
        onChange={setSubTab}
        ariaLabel="Secciones de catálogos de tickets"
        className="settings-tab-row settings-subtabs"
      />

      {subTab === 'departments' ? (
        <>
          <SettingsMasterDetail
            wideDetail
            list={
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
                    <tr key={d.id} {...selectableRowProps(selectedDeptId === d.id, () => setSelectedDeptId(d.id))}>
                      <td>{d.name}</td>
                      <td>{d.isActive ? 'sí' : 'no'}</td>
                      <td>
                        <button
                          type="button"
                          className="settings-btn settings-btn--small"
                          onClick={(e) => void toggleDept(d, e)}
                        >
                          {d.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            detail={
              <div className="settings-card">
                {selectedDept ? (
                  <form className="settings-detail-form" onSubmit={(e) => void saveSelectedDept(e)}>
                    <div className="settings-detail-head">
                      <h3>{selectedDept.name}</h3>
                      <p className="settings-muted">Campos propios de este departamento</p>
                    </div>
                    <label className="settings-field">
                      Nombre
                      <input
                        className="chat-input"
                        value={deptForm.name}
                        onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </label>
                    <label className="settings-field">
                      Descripción
                      <input
                        className="chat-input"
                        value={deptForm.description}
                        onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Opcional"
                      />
                    </label>
                    <h4>Códigos de inventario de equipos</h4>
                    <p className="settings-muted">
                      El valor debe coincidir con el número de serie registrado en cada activo al vincularlo a un
                      ticket.
                    </p>
                    <label className="settings-field">
                      Ejemplo
                      <input
                        className="chat-input"
                        value={deptForm.assetInventoryCodeExample}
                        onChange={(e) => setDeptForm((p) => ({ ...p, assetInventoryCodeExample: e.target.value }))}
                        placeholder="p. ej. SYSTEM0000"
                      />
                    </label>
                    <label className="settings-field">
                      Patrón regex
                      <input
                        className="chat-input"
                        value={deptForm.assetInventoryCodePattern}
                        onChange={(e) => setDeptForm((p) => ({ ...p, assetInventoryCodePattern: e.target.value }))}
                        placeholder="p. ej. ^SYSTEM\\d{4}$"
                      />
                    </label>
                    <button type="submit" className="settings-btn" disabled={savingDept}>
                      {savingDept ? 'Guardando…' : 'Guardar departamento'}
                    </button>
                  </form>
                ) : (
                  <p className="settings-detail-empty settings-muted">Selecciona un departamento en la lista.</p>
                )}
              </div>
            }
          />
          <SettingsSectionCard title="Añadir departamento">
            <form className="settings-form" onSubmit={(e) => void addDepartment(e)}>
              <input name="name" placeholder="Nombre" required className="chat-input" />
              <input name="description" placeholder="Descripción" className="chat-input" />
              <button type="submit" className="settings-btn">
                Añadir departamento
              </button>
            </form>
          </SettingsSectionCard>
        </>
      ) : null}

      {subTab === 'statuses' ? (
        <SettingsSectionCard title="Estados de ticket" description="Catálogo global de estados para flujos y tickets.">
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
                          .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo eliminar el estado.')))
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
        </SettingsSectionCard>
      ) : null}

      {subTab === 'priorities' ? (
        <SettingsSectionCard title="Prioridades" description="SLA de respuesta y resolución por prioridad.">
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
                          .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo eliminar la prioridad.')))
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
        </SettingsSectionCard>
      ) : null}
    </section>
  );
}
