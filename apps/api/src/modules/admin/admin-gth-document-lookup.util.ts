import type { PrismaService } from '../../prisma/prisma.service';
import { formatGthDocumentDisplay, normalizeGthDocumentId } from './admin-gth-row.util';

/** Tipo + número de documento por employee_id (lookup en gth_directory). */
export async function mapEmployeeIdsToDocumentDisplay(
  prisma: PrismaService,
  employeeIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(employeeIds.map((id) => id?.trim()).filter(Boolean))] as string[];
  const result = new Map<string, string>();
  if (ids.length === 0) return result;

  const candidates = new Set<string>();
  for (const id of ids) {
    candidates.add(id);
    const norm = normalizeGthDocumentId(id);
    if (norm) candidates.add(norm);
  }

  const rows = await prisma.gthDirectory.findMany({
    where: {
      OR: [...candidates].flatMap((candidate) => [
        { documentId: candidate },
        { documentId: { equals: candidate, mode: 'insensitive' } },
      ]),
    },
    select: { documentId: true, payload: true },
  });

  const displayByDocId = new Map<string, string>();
  for (const row of rows) {
    if (!row.documentId) continue;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const display = formatGthDocumentDisplay(payload, row.documentId);
    if (!display) continue;
    displayByDocId.set(row.documentId, display);
    const norm = normalizeGthDocumentId(row.documentId);
    if (norm) displayByDocId.set(norm, display);
  }

  for (const id of ids) {
    const norm = normalizeGthDocumentId(id);
    const display =
      displayByDocId.get(id) ?? (norm ? displayByDocId.get(norm) : undefined) ?? id;
    result.set(id, display);
  }
  return result;
}
