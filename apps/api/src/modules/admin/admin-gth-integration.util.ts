/** Nombre de la integración externa en Configuración → Integraciones API. */
export const GTH_INTEGRATION_NAME = 'CONEXION-GTH';

const ARRAY_WRAPPER_KEYS = [
  'data',
  'result',
  'results',
  'rows',
  'items',
  'empleados',
  'employees',
  'personal',
  'registros',
  'records',
  'lista',
  'list',
];

function isObjectRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

function arrayOfRecords(node: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(node) || node.length === 0) return null;
  const objs = node.filter(isObjectRecord);
  if (objs.length === 0) return null;
  return objs;
}

/**
 * Localiza el array principal de empleados en la respuesta JSON (filtrada o cruda).
 */
export function extractGthRows(root: unknown): Record<string, unknown>[] {
  if (root == null) return [];

  const direct = arrayOfRecords(root);
  if (direct) return direct;

  if (!isObjectRecord(root)) return [];

  for (const key of ARRAY_WRAPPER_KEYS) {
    if (key in root) {
      const found = extractGthRows(root[key]);
      if (found.length > 0) return found;
    }
  }

  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      const found = extractGthRows(value);
      if (found.length > 0) return found;
    }
  }

  return [root];
}
