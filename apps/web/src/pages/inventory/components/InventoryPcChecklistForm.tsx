import { FormEvent, useEffect, useState } from 'react';
import {
  getMergedChecklists,
  optionsToLines,
  PC_CHECKLIST_DEFAULTS,
  PC_CHECKLIST_KEYS,
  PC_CHECKLIST_LABELS,
  resetChecklistsToDefaults,
  saveAllChecklistsFromLines,
  type PcChecklistKey,
} from '../inventoryPcChecklists';

type Props = {
  onMessage?: (msg: string | null) => void;
};

export function InventoryPcChecklistForm({ onMessage }: Props) {
  const [texts, setTexts] = useState<Record<PcChecklistKey, string>>(() => {
    const m = getMergedChecklists();
    const init = {} as Record<PcChecklistKey, string>;
    for (const k of PC_CHECKLIST_KEYS) {
      init[k] = optionsToLines(m[k]);
    }
    return init;
  });

  useEffect(() => {
    function sync() {
      const merged = getMergedChecklists();
      setTexts((prev) => {
        const next = { ...prev };
        for (const k of PC_CHECKLIST_KEYS) {
          next[k] = optionsToLines(merged[k]);
        }
        return next;
      });
    }
    window.addEventListener('inventory-pc-checklists-changed', sync);
    return () => window.removeEventListener('inventory-pc-checklists-changed', sync);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveAllChecklistsFromLines(texts);
    onMessage?.('Listas guardadas en este navegador.');
  }

  function onRestore() {
    resetChecklistsToDefaults();
    const init = {} as Record<PcChecklistKey, string>;
    for (const k of PC_CHECKLIST_KEYS) {
      init[k] = optionsToLines(PC_CHECKLIST_DEFAULTS[k]);
    }
    setTexts(init);
    onMessage?.('Se restauraron los valores por defecto.');
  }

  return (
    <form className="inventory-checklist-form" onSubmit={onSubmit}>
      <p className="settings-muted">
        Una opción por línea. Estas listas alimentan las sugerencias del formulario de equipos PC (puede escribir
        valores que no estén en la lista). Se guardan en el almacenamiento local del navegador.
      </p>
      <div className="inventory-checklist-form__grid">
        {PC_CHECKLIST_KEYS.map((k) => (
          <label key={k} className="inventory-checklist-form__field">
            <span className="inventory-checklist-form__label">{PC_CHECKLIST_LABELS[k]}</span>
            <textarea
              rows={6}
              className="inventory-checklist-form__textarea"
              value={texts[k] ?? ''}
              onChange={(e) => setTexts((t) => ({ ...t, [k]: e.target.value }))}
              spellCheck={false}
            />
          </label>
        ))}
      </div>
      <div className="inventory-checklist-form__actions">
        <button type="button" className="secondary settings-btn" onClick={onRestore}>
          Restaurar valores por defecto
        </button>
        <button type="submit" className="settings-btn">
          Guardar listas
        </button>
      </div>
    </form>
  );
}
