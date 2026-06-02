/** Columnas del directorio GTH (plantilla + campos habituales del API CONEXION-GTH). */
export const GTH_TABLE_COLUMNS = [
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

export type GthTableColumn = (typeof GTH_TABLE_COLUMNS)[number];

/** Claves de filtro rápido en la subpestaña GTH. */
export const GTH_FILTER_FIELDS = ['AREA', 'ESTADO', 'CARGO', 'TIPOCONTRATO'] as const;

const EMPTY_MARKERS = new Set(['', '-', '—', 'N/A', 'NA', 'NULL', 'UNDEFINED', 'NINGUNO', 'NINGUNA']);

export function normalizeGthFieldKey(key: string): string {
  return key
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

/** Sinónimos por columna (claves normalizadas). */
const GTH_FIELD_ALIAS_KEYS: Partial<Record<string, readonly string[]>> = {
  TIPO: [
    'TIPODOCUMENTO',
    'TIPO_DOCUMENTO',
    'TIPODOC',
    'TIPOIDENTIFICACION',
    'TIPOID',
    'TIPO_DOC',
    'TIPO DOCUMENTO',
    'NOMBRE DOCUMENTO',
  ],
  DOC: [
    'DOCUMENTO',
    'NUMERODOCUMENTO',
    'NUMERO DOCUMENTO',
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
  PRIMERNOMBRE: ['NOMBRE1', 'PRIMER_NOMBRE', 'PNOMBRE', 'NOMBRE', 'NOMBRE COMPLETO', 'NOMBRECOMPLETO'],
  SEGUNDONOMBRE: ['NOMBRE2', 'SEGUNDO_NOMBRE', 'SNOMBRE'],
  PRIMERAPELLIDO: ['APELLIDO1', 'PRIMER_APELLIDO', 'PAPELLIDO', 'APELLIDO'],
  SEGUNDOAPELLIDO: ['APELLIDO2', 'SEGUNDO_APELLIDO', 'SAPELLIDO'],
  CARGO: ['PUESTO', 'CARGOEMPLEADO', 'NOMBRECARGO', 'DESCRIPCIONCARGO', 'ROL'],
  TIPOCONTRATO: ['TIPO_CONTRATO', 'TIPOCONTRATACION', 'MODALIDADCONTRATO', 'CONTRATO'],
  AREA: ['DEPENDENCIA', 'NOMBREAREA', 'NOMBRE_AREA', 'DEPARTAMENTO', 'SEDE', 'SUBAREA', 'UNIDAD'],
  DIRECCION: [
    'LOCALIDAD',
    'BARRIO',
    'LOCALIDAD/BARRIO',
    'LOCALIDADBARRIO',
    'LUGAR RESIDENCIA',
    'LUGARRESIDENCIA',
    'DIRECCIONRESIDENCIA',
  ],
  TELEFONOS: ['TELEFONO', 'TELEFONO1', 'TELEFONO2', 'TEL', 'PHONE', 'TELEFONOFIJO'],
  EMAIL: ['CORREO', 'MAIL', 'CORREOELECTRONICO', 'EMAILCORPORATIVO', 'CORREOCORPORATIVO', 'CORREO_ELECTRONICO'],
  CELULCAR: ['CELULAR', 'CELULCAR', 'MOVIL', 'CEL', 'TELEFONOCELULAR', 'CELULARPERSONAL', 'TELCELULAR'],
  CIU_NACIMIENTO: [
    'CIUDADNACIMIENTO',
    'CIUDAD_NACIMIENTO',
    'LUGARNACIMIENTO',
    'LUGAR NACIMIENTO',
    'MUNICIPIONACIMIENTO',
    'CIUDADNAC',
    'FECHA NACIMIENTO',
    'FECHANACIMIENTO',
  ],
  GRUPOSANGUINEO: ['GRUPOSANGRE', 'GRUPO_SANGUINEO', 'TIPOSANGRE', 'RH', 'GSANGRE', 'SANGRE'],
  'CODIGO CARNET': ['CODIGOCARNET', 'CODIGOCARNÉ', 'CARNET', 'CODCARNET', 'CODIGOCARNETE'],
  ESTADO: ['ESTADOEMPLEADO', 'ESTADOLABORAL', 'ESTADOTRABAJADOR', 'VINCULACION'],
  FINGRESO: [
    'FECHAINGRESO',
    'FECHA INGRESO',
    'FECHA_INGRESO',
    'INGRESO',
    'FECHAINGRESOEMPRESA',
    'FECHA EXPEDICION',
    'FECHAEXPEDICION',
  ],
  F_CONTRATO: [
    'FECHACONTRATO',
    'FECHA_CONTRATO',
    'FINCONTRATO',
    'FECHAFINCONTRATO',
    'FECHA_FIN_CONTRATO',
    'VENCIMIENTOCONTRATO',
    'FFINCONTRATO',
  ],
  ESTRACTO: ['ESTRATO', 'ESTRATOSOCIECONOMICO', 'ESTRATO_SOCIOECONOMICO'],
  ESCOLARIDAD: ['NIVELEDUCATIVO', 'NIVEL EDUCATIVO', 'NIVEL_EDUCATIVO', 'NIVELACADEMICO', 'NIVEL_ACADEMICO'],
  RELIGION: ['CREDENCIAL', 'FE'],
  CONTACTO_EMERGENCIA: [
    'CONTACTOEMERGENCIA',
    'EMERGENCIA',
    'CONTACTO_EMERG',
    'NOMBREEMERGENCIA',
    'TELEFONOEMERGENCIA',
    'PARENTESCOEMERGENCIA',
  ],
  BASICO: ['SALARIO', 'SUELDO', 'SALARIOBASICO', 'SALARIO_BASICO', 'SUELDO_BASICO', 'BASICOLEGAL'],
  PROFESION: ['TITULO', 'OCUPACION'],
  ESTADOCIVIL: ['ESTADO_CIVIL', 'ECIVIL'],
  EPS: ['IDEPS', 'ID_EPS', 'CODIGOEPS'],
  AFP: ['IDAFP', 'ID_AFP', 'CODIGOAFP'],
  ARL: ['IDARL', 'ID_ARL', 'CODIGOARL'],
  CCF: ['CAJACOMPENSACION', 'CAJA_COMPENSACION', 'CAJACCF', 'NOMBRECCF', 'IDCCF', 'ID_CCF'],
  CESANTIAS: ['FONDOCESANTIAS', 'FONDO_CESANTIAS', 'ENTIDADCESANTIAS', 'IDCESANTIAS'],
  ACC: ['CAJAACC', 'AUXILIOCESANTIA'],
  AFC: ['FONDOAFC', 'AHORROAFC', 'IDAFC', 'ID_AFC'],
  ANEXO: ['TIENEANEXO', 'ANEXOCONTRATO'],
  AUDITORIA: ['AUDIT', 'AUDITADO'],
};

function acceptedKeysForColumn(field: string): Set<string> {
  const keys = new Set<string>();
  keys.add(normalizeGthFieldKey(field));
  for (const alias of GTH_FIELD_ALIAS_KEYS[field] ?? []) {
    keys.add(normalizeGthFieldKey(alias));
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

/** Aplana un nivel de objetos anidados (p. ej. contacto_emergencia: { nombre, telefono }). */
export function flattenGthRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function formatGthCellValue(v: unknown): string {
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

function findFuzzyKey(flat: Record<string, unknown>, field: string): string | null {
  const target = normalizeGthFieldKey(field);
  if (target.length < 4) return null;
  let bestKey: string | null = null;
  let bestScore = 3;
  for (const k of Object.keys(flat)) {
    const nk = normalizeGthFieldKey(k);
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

export type GthResolvedCell = { text: string; sourceKey?: string };

/** Resuelve el valor de una columna (clave del API o nombre canónico) contra el payload. */
export function resolveGthCellValue(row: Record<string, unknown>, field: string): GthResolvedCell {
  const flat = flattenGthRow(row);
  const fieldNorm = normalizeGthFieldKey(field);

  for (const [k, v] of Object.entries(flat)) {
    if (normalizeGthFieldKey(k) === fieldNorm) {
      const text = formatGthCellValue(v);
      return { text, sourceKey: k !== field ? k : undefined };
    }
  }

  const accepted = acceptedKeysForColumn(field);

  for (const [k, v] of Object.entries(flat)) {
    if (accepted.has(normalizeGthFieldKey(k))) {
      const text = formatGthCellValue(v);
      if (text !== '') return { text, sourceKey: k !== field ? k : undefined };
    }
  }

  const fuzzyKey = findFuzzyKey(flat, field);
  if (fuzzyKey) {
    const text = formatGthCellValue(flat[fuzzyKey]);
    if (text !== '') return { text, sourceKey: fuzzyKey };
  }

  return { text: '' };
}

/** @deprecated Use resolveGthCellValue */
export function getGthRowValue(row: Record<string, unknown>, field: string): string {
  return resolveGthCellValue(row, field).text;
}

function isKeyMappedToCanonicalColumn(key: string): boolean {
  const nk = normalizeGthFieldKey(key);
  for (const col of GTH_TABLE_COLUMNS) {
    if (acceptedKeysForColumn(col).has(nk)) return true;
  }
  return false;
}

function discoverFieldsFromRows(sampleRows: Record<string, unknown>[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (key: string) => {
    const k = key.trim();
    if (!k) return;
    const norm = normalizeGthFieldKey(k);
    if (seen.has(norm)) return;
    seen.add(norm);
    ordered.push(k);
  };
  for (const row of sampleRows) {
    if (ordered.length > 0) break;
    for (const k of Object.keys(flattenGthRow(row))) add(k);
  }
  for (const row of sampleRows.slice(0, 250)) {
    for (const k of Object.keys(flattenGthRow(row))) add(k);
  }
  return ordered;
}

function sortColumnsByPriority(fields: string[]): string[] {
  const priority = new Map(GTH_TABLE_COLUMNS.map((f, i) => [normalizeGthFieldKey(f), i]));
  return [...fields].sort((a, b) => {
    const pa = priority.get(normalizeGthFieldKey(a)) ?? 9999;
    const pb = priority.get(normalizeGthFieldKey(b)) ?? 9999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, 'es');
  });
}

function columnHasAnyValue(sampleRows: Record<string, unknown>[], column: string): boolean {
  return sampleRows.some((row) => resolveGthCellValue(row, column).text !== '');
}

/**
 * Columnas de la tabla según campos del API (última sync o directorio).
 * No rellena con la plantilla fija: solo muestra columnas reales del origen.
 */
export function resolveGthTableColumns(
  availableFields: string[] | undefined,
  sampleRows: Record<string, unknown>[],
): string[] {
  const fromApi = (availableFields ?? []).map((f) => f.trim()).filter(Boolean);
  const fromRows = discoverFieldsFromRows(sampleRows);
  const merged: string[] = [];
  const seen = new Set<string>();

  const add = (key: string) => {
    const norm = normalizeGthFieldKey(key);
    if (seen.has(norm)) return;
    seen.add(norm);
    merged.push(key);
  };

  for (const f of fromApi) add(f);
  for (const f of fromRows) add(f);

  let columns = sortColumnsByPriority(merged);

  if (sampleRows.length > 0 && columns.length > 0) {
    columns = columns.filter((col) => columnHasAnyValue(sampleRows, col));
  }

  if (columns.length > 0) return columns;

  if (fromApi.length > 0) return sortColumnsByPriority(fromApi);
  if (fromRows.length > 0) return sortColumnsByPriority(fromRows);

  return [...GTH_TABLE_COLUMNS];
}

export function gthRowSearchText(row: Record<string, unknown>): string {
  const flat = flattenGthRow(row);
  return Object.values(flat)
    .map((v) => formatGthCellValue(v))
    .join(' ')
    .toLowerCase();
}

/** Cédula normalizada (solo dígitos), alineada con el API. */
export function normalizeGthDocumentId(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits || raw.trim();
}

export function pickGthRowDocumentId(row: Record<string, unknown>): string | null {
  const doc = getGthRowValue(row, 'DOC');
  if (!doc) return null;
  const normalized = normalizeGthDocumentId(doc);
  return normalized || null;
}

/** Secciones del modal de detalle GTH (orden de campos por bloque). */
export const GTH_DETAIL_SECTIONS: ReadonlyArray<{ title: string; columns: readonly string[] }> = [
  {
    title: 'Identificación',
    columns: ['TIPO', 'DOC', 'CODIGO', 'CODIGO CARNET', 'ESTADO'],
  },
  {
    title: 'Nombre completo',
    columns: ['PRIMERNOMBRE', 'SEGUNDONOMBRE', 'PRIMERAPELLIDO', 'SEGUNDOAPELLIDO'],
  },
  {
    title: 'Datos laborales',
    columns: ['CARGO', 'AREA', 'TIPOCONTRATO', 'ANEXO', 'AUDITORIA'],
  },
  {
    title: 'Contacto',
    columns: ['DIRECCION', 'TELEFONOS', 'CELULCAR', 'EMAIL', 'CONTACTO_EMERGENCIA'],
  },
  {
    title: 'Datos personales',
    columns: [
      'SEXO',
      'PROFESION',
      'ESTADOCIVIL',
      'CIU_NACIMIENTO',
      'GRUPOSANGUINEO',
      'ESTRACTO',
      'ESCOLARIDAD',
      'RELIGION',
    ],
  },
  {
    title: 'Seguridad social y prestaciones',
    columns: ['EPS', 'AFP', 'ARL', 'CCF', 'CESANTIAS', 'ACC', 'AFC'],
  },
  {
    title: 'Contrato y compensación',
    columns: ['FINGRESO', 'F_CONTRATO', 'BASICO'],
  },
];

export type GthDetailField = { label: string; value: string; sourceKey?: string };

export type GthDetailSection = { title: string; fields: GthDetailField[] };

function columnInList(column: string, list: readonly string[]): boolean {
  const nk = normalizeGthFieldKey(column);
  return list.some((c) => normalizeGthFieldKey(c) === nk);
}

function apiColumnMapsToCanonical(apiCol: string, canonicalCol: string): boolean {
  return acceptedKeysForColumn(canonicalCol).has(normalizeGthFieldKey(apiCol));
}

function apiColumnBelongsToSection(apiCol: string, sectionColumns: readonly string[]): boolean {
  return sectionColumns.some((canonical) => apiColumnMapsToCanonical(apiCol, canonical));
}

function markColumnCovered(
  covered: Set<string>,
  canonicalCol: string,
  cols: string[],
  sourceKey?: string,
): void {
  covered.add(normalizeGthFieldKey(canonicalCol));
  if (sourceKey) covered.add(normalizeGthFieldKey(sourceKey));
  for (const c of cols) {
    if (apiColumnMapsToCanonical(c, canonicalCol)) {
      covered.add(normalizeGthFieldKey(c));
    }
  }
}

/** Agrupa todos los campos de una fila GTH para el modal de detalle. */
export function buildGthRowDetailSections(
  row: Record<string, unknown>,
  allColumns?: string[],
): GthDetailSection[] {
  const cols = allColumns ?? resolveGthTableColumns(undefined, [row]);
  const sections: GthDetailSection[] = [];
  const coveredColumns = new Set<string>();

  for (const { title, columns } of GTH_DETAIL_SECTIONS) {
    const fields: GthDetailField[] = [];
    for (const col of columns) {
      const resolved = resolveGthCellValue(row, col);
      if (!resolved.text) continue;
      markColumnCovered(coveredColumns, col, cols, resolved.sourceKey);
      fields.push({
        label: col,
        value: resolved.text,
        sourceKey: resolved.sourceKey,
      });
    }
    if (fields.length > 0) sections.push({ title, fields });
  }

  const otrosFields: GthDetailField[] = [];
  for (const col of cols) {
    const nk = normalizeGthFieldKey(col);
    if (coveredColumns.has(nk)) continue;
    if (GTH_DETAIL_SECTIONS.some((sec) => apiColumnBelongsToSection(col, sec.columns))) {
      continue;
    }
    const resolved = resolveGthCellValue(row, col);
    const value = resolved.text || '—';
    if (value === '—') continue;
    otrosFields.push({ label: col, value, sourceKey: resolved.sourceKey });
  }

  if (otrosFields.length > 0) {
    sections.push({ title: 'Otros campos', fields: otrosFields });
  }

  return sections;
}

/** Título legible para el encabezado del modal. */
export function gthRowDisplayTitle(row: Record<string, unknown>): string {
  const parts = [
    getGthRowValue(row, 'PRIMERNOMBRE'),
    getGthRowValue(row, 'SEGUNDONOMBRE'),
    getGthRowValue(row, 'PRIMERAPELLIDO'),
    getGthRowValue(row, 'SEGUNDOAPELLIDO'),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  const doc = getGthRowValue(row, 'DOC');
  if (doc) return `Documento ${doc}`;
  const cargo = getGthRowValue(row, 'CARGO');
  if (cargo) return cargo;
  return 'Registro GTH';
}

/** Clave estable por fila (misma lógica que admin-gth-row.util.ts en el API). */
export function gthRowStableExternalKey(row: Record<string, unknown>, index: number): string {
  const doc = pickGthRowDocumentId(row);
  if (doc) return `doc:${doc}`;
  const pn = getGthRowValue(row, 'PRIMERNOMBRE');
  const pa = getGthRowValue(row, 'PRIMERAPELLIDO');
  const sa = getGthRowValue(row, 'SEGUNDOAPELLIDO');
  if (pn || pa) return `person:${pn}:${pa}:${sa}`;
  return `row:${index}`;
}
