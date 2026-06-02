function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

const EMPTY_MARKERS = new Set(['', '-', '—', 'N/A', 'NA', 'NULL', 'UNDEFINED', 'NINGUNO', 'NINGUNA']);

/** Sinónimos por columna (claves normalizadas), alineados con settingsUsersGthFields.ts. */
const GTH_FIELD_ALIAS_KEYS: Partial<Record<string, readonly string[]>> = {
  TIPO: ['TIPODOCUMENTO', 'TIPO_DOCUMENTO', 'TIPODOC', 'TIPOIDENTIFICACION', 'TIPOID', 'TIPO_DOC'],
  DOC: [
    'DOCUMENTO',
    'NUMERODOCUMENTO',
    'NUMERO_DOCUMENTO',
    'NRODOCUMENTO',
    'NRO_DOCUMENTO',
    'CEDULA',
    'IDENTIFICACION',
    'IDEMPLEADO',
    'EMPLOYEEID',
    'NO_DOCUMENTO',
  ],
  CODIGO: ['CODIGOEMPLEADO', 'CODIGO_EMPLEADO', 'IDINTERNO', 'CODEMPLEADO', 'COD'],
  PRIMERNOMBRE: ['NOMBRE1', 'PRIMER_NOMBRE', 'PNOMBRE', 'NOMBRE'],
  SEGUNDONOMBRE: ['NOMBRE2', 'SEGUNDO_NOMBRE', 'SNOMBRE'],
  PRIMERAPELLIDO: ['APELLIDO1', 'PRIMER_APELLIDO', 'PAPELLIDO', 'APELLIDO'],
  SEGUNDOAPELLIDO: ['APELLIDO2', 'SEGUNDO_APELLIDO', 'SAPELLIDO'],
  CARGO: ['PUESTO', 'CARGOEMPLEADO', 'NOMBRECARGO', 'DESCRIPCIONCARGO', 'ROL'],
  TIPOCONTRATO: ['TIPO_CONTRATO', 'TIPOCONTRATACION', 'MODALIDADCONTRATO', 'CONTRATO'],
  AREA: ['DEPENDENCIA', 'NOMBREAREA', 'NOMBRE_AREA', 'DEPARTAMENTO', 'SEDE', 'SUBAREA', 'UNIDAD'],
  FINGRESO: [
    'FECHAINGRESO',
    'FECHAINGRESOEMPRESA',
    'FECHA_INGRESO',
    'FECHA INGRESO',
    'INGRESO',
    'FINGRESOEMPRESA',
    'FECHAINGRESOEMP',
  ],
  ESTADO: ['ESTADOEMPLEADO', 'ESTADOLABORAL', 'ESTADOTRABAJADOR', 'VINCULACION'],
  EMAIL: ['CORREO', 'MAIL', 'CORREOELECTRONICO', 'EMAILCORPORATIVO', 'CORREOCORPORATIVO', 'CORREO_ELECTRONICO'],
  TELEFONOS: ['TELEFONO', 'PHONE', 'TEL'],
  CELULCAR: ['CELULAR', 'MOVIL', 'MOBILE', 'CEL'],
};

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

function formatGthCellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const s = String(v).trim();
  if (EMPTY_MARKERS.has(s.toUpperCase())) return '';
  return s;
}

function acceptedKeysForColumn(field: string): Set<string> {
  const keys = new Set<string>();
  keys.add(normalizeFieldKey(field));
  for (const alias of GTH_FIELD_ALIAS_KEYS[field] ?? []) {
    keys.add(normalizeFieldKey(alias));
  }
  return keys;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

function findFuzzyKey(flat: Record<string, unknown>, field: string): string | null {
  const target = normalizeFieldKey(field);
  if (target.length < 4) return null;
  let bestKey: string | null = null;
  let bestScore = 3;
  for (const k of Object.keys(flat)) {
    const nk = normalizeFieldKey(k);
    if (nk === target) return k;
    if (nk.startsWith(target) || target.startsWith(nk)) {
      const score = Math.abs(nk.length - target.length);
      if (score < bestScore) {
        bestScore = score;
        bestKey = k;
      }
    }
    const dist = levenshtein(nk, target);
    if (dist < bestScore && dist <= 2) {
      bestScore = dist;
      bestKey = k;
    }
  }
  return bestKey;
}

/** Resuelve el valor de una columna GTH contra el payload (aliases + fuzzy + anidados). */
export function resolveGthFieldValue(row: Record<string, unknown>, field: string): string {
  const flat = flattenGthRow(row);
  const fieldNorm = normalizeFieldKey(field);

  for (const [k, v] of Object.entries(flat)) {
    if (normalizeFieldKey(k) === fieldNorm) {
      const text = formatGthCellValue(v);
      if (text !== '') return text;
    }
  }

  const accepted = acceptedKeysForColumn(field);
  for (const [k, v] of Object.entries(flat)) {
    if (accepted.has(normalizeFieldKey(k))) {
      const text = formatGthCellValue(v);
      if (text !== '') return text;
    }
  }

  const fuzzyKey = findFuzzyKey(flat, field);
  if (fuzzyKey) {
    const text = formatGthCellValue(flat[fuzzyKey]);
    if (text !== '') return text;
  }

  return '';
}

const DOC_KEYS = new Set(
  ['DOC', 'DOCUMENTO', 'NUMERODOCUMENTO', 'CEDULA', 'IDENTIFICACION', 'IDEMPLEADO'].map(normalizeFieldKey),
);

/** Cédula normalizada (solo dígitos) para comparar altas entre syncs. */
export function normalizeGthDocumentId(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits || raw.trim();
}

export function pickGthDocumentId(row: Record<string, unknown>): string | null {
  const resolved = resolveGthFieldValue(row, 'DOC');
  if (resolved) {
    const normalized = normalizeGthDocumentId(resolved);
    if (normalized) return normalized;
  }

  const flat = flattenGthRow(row);
  for (const [k, v] of Object.entries(flat)) {
    if (!DOC_KEYS.has(normalizeFieldKey(k))) continue;
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    const normalized = normalizeGthDocumentId(s);
    if (normalized) return normalized;
  }
  return null;
}

/** @deprecated Prefer resolveGthFieldValue */
export function pickGthField(row: Record<string, unknown>, ...fields: string[]): string {
  for (const field of fields) {
    const value = resolveGthFieldValue(row, field);
    if (value) return value;
  }
  return '';
}

const GTH_INACTIVE_ESTADO = new Set([
  'INACTIVO',
  'INACTIVA',
  'INACTIVE',
  'I',
  '0',
  'NO',
  'RETIRADO',
  'RETIRADA',
  'RETIRO',
  'DESVINCULADO',
  'DESVINCULADA',
  'CESANTE',
  'FALLECIDO',
  'FALLECIDA',
  'SUSPENDIDO',
  'SUSPENDIDA',
  'LICENCIA',
  'EGRESADO',
  'EGRESADA',
]);

/** Activo según campo ESTADO del payload GTH. Vacío → activo. */
export function isGthEmployeeActiveByEstado(row: Record<string, unknown>): boolean {
  const raw = resolveGthFieldValue(row, 'ESTADO');
  if (!raw) return true;
  const norm = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');
  if (!norm) return true;
  if (GTH_INACTIVE_ESTADO.has(norm)) return false;
  if (norm.includes('INACTIV') || norm.includes('RETIR') || norm.includes('DESVINCUL')) {
    return false;
  }
  return true;
}

export function pickGthEstadoLabel(row: Record<string, unknown>): string {
  return resolveGthFieldValue(row, 'ESTADO') || '—';
}

/** Fecha de ingreso (FINGRESO) formateada para listados. */
export function formatGthFingresoDisplay(raw: string): string {
  const s = raw.trim();
  if (!s) return '—';
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }
  return s;
}

export function pickGthFingreso(row: Record<string, unknown>): string {
  return formatGthFingresoDisplay(resolveGthFieldValue(row, 'FINGRESO'));
}

const FULL_NAME_FALLBACK_FIELDS = [
  'NOMBRECOMPLETO',
  'NOMBRE_EMPLEADO',
  'NOMBREEMPLEADO',
  'NOMBREYAPELLIDOS',
  'EMPLEADO',
  'NOMEMPLEADO',
] as const;

export function buildGthEmployeeFullName(row: Record<string, unknown>): string {
  const parts = [
    resolveGthFieldValue(row, 'PRIMERNOMBRE'),
    resolveGthFieldValue(row, 'SEGUNDONOMBRE'),
    resolveGthFieldValue(row, 'PRIMERAPELLIDO'),
    resolveGthFieldValue(row, 'SEGUNDOAPELLIDO'),
  ].filter(Boolean);
  const joined = parts.join(' ').trim();
  if (joined) return joined;

  for (const field of FULL_NAME_FALLBACK_FIELDS) {
    const full = resolveGthFieldValue(row, field);
    if (full) return full;
  }

  return 'Empleado GTH';
}

export function pickGthDocumentType(row: Record<string, unknown>): string {
  return resolveGthFieldValue(row, 'TIPO');
}

export function buildGthEmployeeSnapshot(row: Record<string, unknown>) {
  return {
    documentId: pickGthDocumentId(row),
    documentType: pickGthDocumentType(row),
    fullName: buildGthEmployeeFullName(row),
    cargo: resolveGthFieldValue(row, 'CARGO'),
  };
}

export type GthEmployeeTemplate = {
  fullName: string;
  cargo: string;
  documentType: string;
  documentNumber: string | null;
};

/** Campos estándar de la plantilla Alta GTH (Comunicaciones). */
export function buildGthEmployeeTemplate(row: Record<string, unknown>): GthEmployeeTemplate {
  const snapshot = buildGthEmployeeSnapshot(row);
  return {
    fullName: snapshot.fullName,
    cargo: snapshot.cargo || '—',
    documentType: snapshot.documentType || '—',
    documentNumber: snapshot.documentId,
  };
}

/** Texto legible para descripción del ticket y mensaje inicial del canal de chat. */
export function formatGthOnboardingChatMessage(row: Record<string, unknown>): string {
  const t = buildGthEmployeeTemplate(row);
  return [
    'Plantilla — Alta GTH (Comunicaciones)',
    '────────────────────────────────────',
    `Nombre completo: ${t.fullName}`,
    `Cargo: ${t.cargo}`,
    `Tipo de documento: ${t.documentType}`,
    `Número de documento: ${t.documentNumber ?? '—'}`,
    '────────────────────────────────────',
    '',
    'Instrucción: adjunte la fotografía del empleado al resolver este ticket.',
  ].join('\n');
}

export function stableGthExternalRowKey(row: Record<string, unknown>, index: number): string {
  const doc = pickGthDocumentId(row);
  if (doc) return `doc:${doc}`;
  const pn = resolveGthFieldValue(row, 'PRIMERNOMBRE');
  const pa = resolveGthFieldValue(row, 'PRIMERAPELLIDO');
  const sa = resolveGthFieldValue(row, 'SEGUNDOAPELLIDO');
  if (pn || pa) return `person:${pn}:${pa}:${sa}`;
  return `row:${index}`;
}

/** Texto buscable de un payload GTH (todas las columnas visibles). */
export function buildGthPayloadSearchText(row: Record<string, unknown>): string {
  const flat = flattenGthRow(row);
  return Object.values(flat)
    .map((v) => formatGthCellValue(v))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
