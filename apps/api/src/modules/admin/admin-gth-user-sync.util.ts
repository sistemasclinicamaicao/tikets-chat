import {
  buildGthEmployeeFullName,
  isGthEmployeeActiveByEstado,
  pickGthDocumentId,
  resolveGthFieldValue,
} from './admin-gth-row.util';

export function parseGthEmail(raw: string): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const first = normalized.split(/\s+-\s+|\s*;\s*|\s*,\s*/)[0]?.trim();
  if (!first || !first.includes('@')) return null;
  return first;
}

export function pickGthEmail(row: Record<string, unknown>): string | null {
  const raw = resolveGthFieldValue(row, 'EMAIL');
  return parseGthEmail(raw);
}

function pickGthPhone(row: Record<string, unknown>): string | null {
  for (const field of ['CELULCAR', 'TELEFONOS', 'TELEFONO', 'CELULAR']) {
    const v = resolveGthFieldValue(row, field).trim();
    if (v) return v;
  }
  return null;
}

export type GthUserSyncPatch = {
  employeeId: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  dependencyName: string | null;
  laborType: string | null;
  isActive: boolean;
};

/** Campos de `users` derivados del payload GTH (login OTP usa esta tabla). */
export function buildGthUserSyncPatch(row: Record<string, unknown>): GthUserSyncPatch | null {
  const employeeId = pickGthDocumentId(row);
  if (!employeeId) return null;

  return {
    employeeId,
    name: buildGthEmployeeFullName(row),
    email: pickGthEmail(row),
    phone: pickGthPhone(row),
    jobTitle: resolveGthFieldValue(row, 'CARGO').trim() || null,
    dependencyName: resolveGthFieldValue(row, 'AREA').trim() || null,
    laborType: resolveGthFieldValue(row, 'TIPOCONTRATO').trim() || null,
    isActive: isGthEmployeeActiveByEstado(row),
  };
}

export function normalizeEmailForCompare(raw: string | null | undefined): string {
  return parseGthEmail(raw ?? '') ?? '';
}
