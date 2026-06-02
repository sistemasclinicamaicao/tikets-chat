import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreateTemplate,
  adminCreateTemplateField,
  adminDeleteTemplateField,
  adminListDepartments,
  adminListTemplates,
  adminUpdateTemplate,
  type AdminDepartmentRow,
  type AdminTemplateRow,
} from '../../lib/api';
import { SettingsMasterDetail } from './SettingsMasterDetail';
import { SettingsSectionCard } from './SettingsSectionCard';
import { selectableRowProps, settingsErrorMessage } from './settingsUtils';

export function SettingsTemplatesPanel({ onMessage }: { onMessage: (s: string | null) => void }) {
  const [rows, setRows] = useState<AdminTemplateRow[]>([]);
  const [departments, setDepartments] = useState<AdminDepartmentRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => rows.find((t) => t.id === selectedTemplateId) ?? null,
    [rows, selectedTemplateId],
  );

  const refresh = useCallback(() => {
    onMessage(null);
    void Promise.all([adminListTemplates(), adminListDepartments()])
      .then(([t, d]) => {
        setRows(t);
        setDepartments(d);
        setSelectedTemplateId((prev) => {
          if (prev && t.some((row) => row.id === prev)) return prev;
          return t[0]?.id ?? null;
        });
      })
      .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudieron cargar las plantillas o departamentos.')));
  }, [onMessage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addTpl(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const created = await adminCreateTemplate({
        department_id: String(fd.get('department_id')),
        name: String(fd.get('name') ?? '').trim(),
        usage_type: String(fd.get('usage_type') ?? 'ticket_create').trim(),
      });
      onMessage('Plantilla creada');
      setSelectedTemplateId(created.id);
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo crear la plantilla.'));
    }
  }

  async function addField(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedTemplateId) return;
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
      await adminCreateTemplateField(selectedTemplateId, {
        field_key: String(fd.get('field_key') ?? '').trim(),
        field_label: String(fd.get('field_label') ?? '').trim(),
        field_type: String(fd.get('field_type') ?? 'text').trim(),
        is_required: fd.get('is_required') === 'on',
        config_json: Object.keys(config).length ? config : undefined,
      });
      onMessage('Campo añadido');
      refresh();
      e.currentTarget.reset();
    } catch (err) {
      onMessage(settingsErrorMessage(err, 'No se pudo añadir el campo.'));
    }
  }

  return (
    <section className="settings-stack">
      <h2>Plantillas y campos</h2>

      <SettingsSectionCard title="Crear plantilla">
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
      </SettingsSectionCard>

      <SettingsMasterDetail
        list={
          <table className="settings-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Departamento</th>
                <th>Tipo</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tpl) => (
                <tr
                  key={tpl.id}
                  {...selectableRowProps(selectedTemplateId === tpl.id, () => setSelectedTemplateId(tpl.id))}
                >
                  <td>{tpl.name}</td>
                  <td>{tpl.department?.name ?? tpl.departmentId}</td>
                  <td>{tpl.usageType}</td>
                  <td>{tpl.isActive ? 'sí' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        detail={
          <div className="settings-card">
            {selectedTemplate ? (
              <>
                <div className="settings-detail-head">
                  <h3>{selectedTemplate.name}</h3>
                  <p className="settings-muted">
                    {selectedTemplate.department?.name ?? selectedTemplate.departmentId} · {selectedTemplate.usageType}
                  </p>
                </div>
                <button
                  type="button"
                  className="settings-btn settings-btn--small"
                  onClick={() =>
                    void adminUpdateTemplate(selectedTemplate.id, { is_active: !selectedTemplate.isActive })
                      .then(() => refresh())
                      .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo actualizar la plantilla.')))
                  }
                >
                  {selectedTemplate.isActive ? 'Desactivar plantilla' : 'Activar plantilla'}
                </button>
                <h4>Campos</h4>
                <ul className="settings-list">
                  {selectedTemplate.fields.map((f) => (
                    <li key={f.id}>
                      <code>{f.fieldKey}</code> — {f.fieldLabel} ({f.fieldType})
                      <button
                        type="button"
                        className="settings-btn settings-btn--small settings-btn--danger"
                        onClick={() =>
                          void adminDeleteTemplateField(f.id)
                            .then(() => refresh())
                            .catch((err) => onMessage(settingsErrorMessage(err, 'No se pudo eliminar el campo.')))
                        }
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                  {selectedTemplate.fields.length === 0 ? (
                    <li className="settings-muted">Sin campos definidos.</li>
                  ) : null}
                </ul>
                <form className="settings-form settings-form--grid" onSubmit={(e) => void addField(e)}>
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
              </>
            ) : (
              <p className="settings-detail-empty settings-muted">Selecciona una plantilla en la lista.</p>
            )}
          </div>
        }
      />
    </section>
  );
}
