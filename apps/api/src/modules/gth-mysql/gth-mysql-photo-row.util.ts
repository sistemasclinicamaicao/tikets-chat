import {
  buildGthEmployeeFullName,
  formatGthDocumentDisplay,
  normalizeGthDocumentId,
  pickGthDocumentId,
  pickGthDocumentType,
} from '../admin/admin-gth-row.util';

export type GthMysqlPhotoRow = {
  cedulaDigits: string;
  tipoDocumento: string | null;
  documentoDisplay: string | null;
  nombre: string | null;
  mimeType: string;
  foto: Buffer;
  recordId: string;
  actualizadoEn: Date;
};

export function buildGthMysqlPhotoRow(record: {
  id: string;
  documentId: string | null;
  fullName: string;
  payload: unknown;
  photoMimeType: string | null;
  photoData: Uint8Array | Buffer | null;
  photoUploadedAt: Date | null;
}): { ok: true; row: GthMysqlPhotoRow } | { ok: false; error: string } {
  const payload = (record.payload ?? {}) as Record<string, unknown>;
  const docRaw = pickGthDocumentId(payload) ?? record.documentId?.trim() ?? '';
  const cedulaDigits = normalizeGthDocumentId(docRaw);
  if (!cedulaDigits) {
    return { ok: false, error: 'Registro sin documento para MySQL' };
  }

  if (record.photoData == null) {
    return { ok: false, error: 'Registro sin photo_data' };
  }
  const foto = Buffer.isBuffer(record.photoData) ? record.photoData : Buffer.from(record.photoData);
  if (foto.length === 0) {
    return { ok: false, error: 'photo_data vacío' };
  }

  const tipo = pickGthDocumentType(payload).trim() || null;
  const display = formatGthDocumentDisplay(payload, docRaw) || docRaw;
  const nombre = buildGthEmployeeFullName(payload);
  const fullName = nombre !== 'Empleado GTH' ? nombre : record.fullName?.trim() || null;

  return {
    ok: true,
    row: {
      cedulaDigits,
      tipoDocumento: tipo,
      documentoDisplay: display,
      nombre: fullName,
      mimeType: record.photoMimeType?.trim() || 'image/jpeg',
      foto,
      recordId: record.id,
      actualizadoEn: record.photoUploadedAt ?? new Date(),
    },
  };
}
