/** Listas sugeridas para el formulario PC (datalist). Persistencia local en el navegador. */

export const PC_CHECKLIST_STORAGE_KEY = 'inventory-pc-checklists-v1';

export const PC_CHECKLIST_KEYS = [
  'tp_almacenamiento',
  'tp_ram',
  'ram',
  'sis_operativo',
  'estado_actual',
  'remoto',
] as const;

export type PcChecklistKey = (typeof PC_CHECKLIST_KEYS)[number];

export const PC_CHECKLIST_LABELS: Record<PcChecklistKey, string> = {
  tp_almacenamiento: 'Tipo de almacenamiento',
  tp_ram: 'Tipo de RAM',
  ram: 'Tamaño / tipo RAM',
  sis_operativo: 'Sistema operativo',
  estado_actual: 'Estado del equipo',
  remoto: 'Acceso remoto',
};

export const PC_CHECKLIST_DEFAULTS: Record<PcChecklistKey, string[]> = {
  tp_almacenamiento: [
    'ESTADO SOLIDO',
    'SSD',
    'DISCO DURO',
    'HDD',
    'HÍBRIDO',
    'HIBRIDO',
    'eMMC',
    'NVMe',
  ],
  tp_ram: ['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5', 'SDRAM'],
  ram: ['4GB', '8GB', '16GB', '32GB', '64GB', '128GB'],
  sis_operativo: [
    'WINDOWS 10',
    'WINDOWS 11',
    'WINDOWS SERVER 2019',
    'WINDOWS SERVER 2022',
    'LINUX',
    'UBUNTU',
    'DEBIAN',
    'macOS',
  ],
  estado_actual: ['BUENO', 'REGULAR', 'MALO', 'MANTENIMIENTO', 'BAJA', 'REPUESTO', 'ÓPTIMO', 'OPTIMO'],
  remoto: ['VNC', 'RDP', 'AnyDesk', 'TeamViewer', 'SSH', 'NO', 'N/A'],
};

function uniqueSorted(opts: string[]): string[] {
  const seen = new Set<string>();
  const r: string[] = [];
  for (const o of opts) {
    const t = o.trim();
    if (!t || seen.has(t.toUpperCase())) continue;
    seen.add(t.toUpperCase());
    r.push(t);
  }
  return r.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function parseFullStored(raw: string | null): Partial<Record<PcChecklistKey, string[]>> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const out: Partial<Record<PcChecklistKey, string[]>> = {};
    for (const k of PC_CHECKLIST_KEYS) {
      const arr = (v as Record<string, unknown>)[k];
      if (!Array.isArray(arr)) continue;
      const u = uniqueSorted(arr.map((x) => String(x)));
      if (u.length) out[k] = u;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function getMergedChecklists(): Record<PcChecklistKey, string[]> {
  let stored: Partial<Record<PcChecklistKey, string[]>> | null = null;
  try {
    stored = parseFullStored(localStorage.getItem(PC_CHECKLIST_STORAGE_KEY));
  } catch {
    stored = null;
  }
  const out = {} as Record<PcChecklistKey, string[]>;
  for (const k of PC_CHECKLIST_KEYS) {
    const custom = stored?.[k];
    out[k] = custom?.length ? custom : PC_CHECKLIST_DEFAULTS[k];
  }
  return out;
}

export function saveAllChecklistsFromLines(lines: Record<PcChecklistKey, string>): void {
  const obj: Record<string, string[]> = {};
  for (const k of PC_CHECKLIST_KEYS) {
    obj[k] = uniqueSorted(
      (lines[k] ?? '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  try {
    localStorage.setItem(PC_CHECKLIST_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event('inventory-pc-checklists-changed'));
}

export function resetChecklistsToDefaults(): void {
  try {
    localStorage.removeItem(PC_CHECKLIST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('inventory-pc-checklists-changed'));
}

export function optionsToLines(opts: string[] | undefined): string {
  return (opts ?? []).join('\n');
}
