import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreateWorkflow,
  adminCreateWorkflowTransition,
  adminDeleteWorkflowTransition,
  adminListDepartments,
  adminListTicketStatuses,
  adminListWorkflows,
  adminUpdateWorkflow,
  type AdminDepartmentRow,
  type AdminTicketStatusRow,
  type AdminWorkflowRow,
} from '../../lib/api';
import { SettingsMasterDetail } from './SettingsMasterDetail';
import { SettingsSectionCard } from './SettingsSectionCard';
import { selectableRowProps, settingsErrorMessage } from './settingsUtils';

export function SettingsWorkflowsPanel({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [rows, setRows] = useState<AdminWorkflowRow[]>([]);
  const [statuses, setStatuses] = useState<AdminTicketStatusRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const selectedWorkflow = useMemo(
    () => rows.find((w) => w.id === selectedWorkflowId) ?? null,
    [rows, selectedWorkflowId],
  );

  const refresh = useCallback(() => {
    onMessage(null);
    void Promise.all([adminListWorkflows(), adminListTicketStatuses(), adminListDepartments()])
      .then(([w, s, d]) => {
        setRows(w);
        setStatuses(s);
        setDepartments(d);
        setSelectedWorkflowId((prev) => {
          if (prev && w.some((row) => row.id === prev)) return prev;
          return w[0]?.id ?? null;
        });
      })
      .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudieron cargar los flujos.')));
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addWorkflow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const created = await adminCreateWorkflow({
        department_id: String(fd.get('department_id')),
        name: String(fd.get('name') ?? '').trim(),
      });
      onMessage('Flujo creado');
      setSelectedWorkflowId(created.id);
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo crear el flujo.'));
    }
  }

  async function addTransition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedWorkflowId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await adminCreateWorkflowTransition(selectedWorkflowId, {
        from_status_id: String(fd.get('from_status_id')),
        to_status_id: String(fd.get('to_status_id')),
        requires_comment: fd.get('requires_comment') === 'on',
        requires_resolution: fd.get('requires_resolution') === 'on',
        requires_checklist: fd.get('requires_checklist') === 'on',
        requires_supervisor_approval: fd.get('requires_supervisor_approval') === 'on',
      });
      onMessage('Transición añadida');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo añadir la transición.'));
    }
  }

  return (
    <section className="settings-stack">
      <h2>Flujos y transiciones</h2>

      <SettingsSectionCard title="Crear flujo">
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
      </SettingsSectionCard>

      <SettingsMasterDetail
        list={
          <table className="settings-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Departamento</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr
                  key={w.id}
                  {...selectableRowProps(selectedWorkflowId === w.id, () => setSelectedWorkflowId(w.id))}
                >
                  <td>{w.name}</td>
                  <td>{w.department?.name ?? w.departmentId}</td>
                  <td>{w.isActive ? 'sí' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        detail={
          <div className="settings-card">
            {selectedWorkflow ? (
              <>
                <div className="settings-detail-head">
                  <h3>{selectedWorkflow.name}</h3>
                  <p className="settings-muted">{selectedWorkflow.department?.name ?? selectedWorkflow.departmentId}</p>
                </div>
                <button
                  type="button"
                  className="settings-btn settings-btn--small"
                  onClick={() =>
                    void adminUpdateWorkflow(selectedWorkflow.id, { is_active: !selectedWorkflow.isActive })
                      .then(() => refresh())
                      .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo actualizar el flujo.')))
                  }
                >
                  {selectedWorkflow.isActive ? 'Desactivar flujo' : 'Activar flujo'}
                </button>
                <h4>Transiciones</h4>
                <ul className="settings-list">
                  {selectedWorkflow.transitions.map((t) => (
                    <li key={t.id}>
                      {t.fromStatus?.code ?? t.fromStatusId} → {t.toStatus?.code ?? t.toStatusId}
                      <button
                        type="button"
                        className="settings-btn settings-btn--small settings-btn--danger"
                        onClick={() =>
                          void adminDeleteWorkflowTransition(t.id)
                            .then(() => refresh())
                            .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo quitar la transición.')))
                        }
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                  {selectedWorkflow.transitions.length === 0 ? (
                    <li className="settings-muted">Sin transiciones definidas.</li>
                  ) : null}
                </ul>
                <form className="settings-form settings-form--grid" onSubmit={(e) => void addTransition(e)}>
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
              </>
            ) : (
              <p className="settings-detail-empty settings-muted">Selecciona un flujo en la lista.</p>
            )}
          </div>
        }
      />
    </section>
  );
}
