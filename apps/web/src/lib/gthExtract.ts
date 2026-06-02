/** Extrae filas de empleados del JSON de CONEXION-GTH (misma lógica que el API). */
export function extractGthRows(root: unknown): Record<string, unknown>[] {
  if (root == null) return [];

  if (Array.isArray(root)) {
    const objs = root.filter((x) => x != null && typeof x === 'object' && !Array.isArray(x)) as Record<
      string,
      unknown
    >[];
    return objs.length > 0 ? objs : [];
  }

  if (typeof root !== 'object') return [];

  const rec = root as Record<string, unknown>;
  const keys = ['data', 'result', 'results', 'rows', 'items', 'empleados', 'employees', 'personal', 'registros'];
  for (const key of keys) {
    if (key in rec) {
      const found = extractGthRows(rec[key]);
      if (found.length > 0) return found;
    }
  }

  for (const value of Object.values(rec)) {
    if (Array.isArray(value)) {
      const found = extractGthRows(value);
      if (found.length > 0) return found;
    }
  }

  return [rec];
}
