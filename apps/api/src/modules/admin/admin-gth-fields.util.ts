/** Prioridad de columnas (nombres canónicos) al ordenar campos del API. */
const GTH_FIELD_PRIORITY = [
  'TIPO',
  'DOC',
  'CODIGO',
  'PRIMERNOMBRE',
  'SEGUNDONOMBRE',
  'PRIMERAPELLIDO',
  'SEGUNDOAPELLIDO',
  'CARGO',
  'TIPOCONTRATO',
  'AREA',
  'DIRECCION',
  'TELEFONOS',
  'EMAIL',
  'SEXO',
  'PROFESION',
  'ESTADOCIVIL',
  'CIU_NACIMIENTO',
  'CELULCAR',
  'GRUPOSANGUINEO',
  'EPS',
  'AFP',
  'ARL',
  'CCF',
  'CESANTIAS',
  'ACC',
  'AFC',
  'FINGRESO',
  'F_CONTRATO',
  'ESTRACTO',
  'ESCOLARIDAD',
  'RELIGION',
  'CONTACTO_EMERGENCIA',
  'BASICO',
  'ESTADO',
  'CODIGO CARNET',
  'ANEXO',
  'AUDITORIA',
] as const;

function normalizeGthFieldKey(key: string): string {
  return key
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function flattenGthRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(row)) {
    if (v == null || typeof v !== 'object' || Array.isArray(v)) continue;
    for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
      const flatKey = `${k}_${sk}`;
      if (!(flatKey in out)) out[flatKey] = sv;
      if (!(sk in out)) out[sk] = sv;
    }
  }
  return out;
}

const priorityIndex = new Map<string, number>(
  GTH_FIELD_PRIORITY.map((f, i) => [normalizeGthFieldKey(f), i]),
);

export function sortGthFieldsByPriority(fields: string[]): string[] {
  return [...fields].sort((a, b) => {
    const pa = priorityIndex.get(normalizeGthFieldKey(a)) ?? 9999;
    const pb = priorityIndex.get(normalizeGthFieldKey(b)) ?? 9999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, 'es');
  });
}

/** Descubre nombres de campo del API preservando el orden del primer registro con datos. */
export function discoverGthAvailableFields(rows: Record<string, unknown>[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const addKey = (key: string) => {
    const k = key.trim();
    if (!k) return;
    const norm = normalizeGthFieldKey(k);
    if (seen.has(norm)) return;
    seen.add(norm);
    ordered.push(k);
  };

  for (const row of rows) {
    if (ordered.length > 0) break;
    for (const k of Object.keys(flattenGthRow(row))) addKey(k);
  }

  const sample = rows.slice(0, Math.min(rows.length, 250));
  for (const row of sample) {
    for (const k of Object.keys(flattenGthRow(row))) addKey(k);
  }

  return sortGthFieldsByPriority(ordered);
}

export function gthAvailableFieldsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}
