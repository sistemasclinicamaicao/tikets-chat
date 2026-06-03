import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { GthMysqlPhotoSyncService } from '../gth-mysql/gth-mysql-photo-sync.service';
import type { GthIncomingRow } from './admin-gth-directory.service';
import {
  buildGthEmployeeFullName,
  buildGthEmployeeSnapshot,
  buildGthPayloadSearchText,
  buildGthPhotoFileName,
  isGthEmployeeActiveByEstado,
  normalizeGthDocumentId,
  pickGthDocumentId,
  pickGthEstadoLabel,
  pickGthFingreso,
  formatGthDocumentDisplay,
  resolveGthFieldValue,
} from './admin-gth-row.util';

const DEFAULT_COMUNICACIONES_NAME = 'COMUNICACIONES';
const UPSERT_BATCH_SIZE = 100;

export type GthComunicacionesRecordsQuery = {
  includeInactive?: boolean;
  q?: string;
  area?: string;
  cargo?: string;
  estado?: string;
  tipoContrato?: string;
  hasPhoto?: 'true' | 'false' | 'all';
  page?: number;
  limit?: number;
};

export type GthComunicacionesRecordRow = {
  id: string;
  external_row_key: string;
  document_id: string | null;
  document_display: string | null;
  full_name: string;
  cargo: string;
  estado: string;
  area: string;
  tipo_contrato: string;
  fecha_ingreso: string;
  is_active: boolean;
  has_photo: boolean;
  photo_attachment_id: string | null;
  photo_uploaded_at: string | null;
  last_synced_at: string;
  created_at: string;
};

export type GthComunicacionesRecordDetail = GthComunicacionesRecordRow & {
  payload: Record<string, unknown>;
};

export type GthComunicacionesRecordsPage = {
  data: GthComunicacionesRecordRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export type GthComunicacionesFilterOptions = {
  AREA: string[];
  ESTADO: string[];
  CARGO: string[];
  TIPOCONTRATO: string[];
};

const GTH_FILTER_FIELDS = ['AREA', 'ESTADO', 'CARGO', 'TIPOCONTRATO'] as const;

@Injectable()
export class AdminGthComunicacionesRecordsService {
  private readonly logger = new Logger(AdminGthComunicacionesRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gthMysqlSync: GthMysqlPhotoSyncService,
  ) {}

  private comunicacionesDepartmentName(): string {
    return (process.env.GTH_COMUNICACIONES_DEPARTMENT_NAME ?? DEFAULT_COMUNICACIONES_NAME).trim();
  }

  async resolveComunicacionesDepartmentId(): Promise<string | null> {
    const target = this.comunicacionesDepartmentName().toUpperCase();
    const dept = await this.prisma.department.findFirst({
      where: {
        isActive: true,
        name: { equals: target, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (dept) return dept.id;

    const fallback = await this.prisma.department.findFirst({
      where: {
        isActive: true,
        name: { contains: 'COMUNICACION', mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    if (!fallback) {
      this.logger.warn(
        `Departamento Comunicaciones no encontrado (GTH_COMUNICACIONES_DEPARTMENT_NAME="${this.comunicacionesDepartmentName()}").`,
      );
      return null;
    }
    return fallback.id;
  }

  async upsertComunicacionesRecords(incoming: GthIncomingRow[], syncedAt: Date): Promise<number> {
    if (incoming.length === 0) return 0;

    let upserted = 0;
    for (let i = 0; i < incoming.length; i += UPSERT_BATCH_SIZE) {
      const batch = incoming.slice(i, i + UPSERT_BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          const payload = row.payload as Record<string, unknown>;
          const snapshot = buildGthEmployeeSnapshot(payload);
          const isActive = isGthEmployeeActiveByEstado(payload);

          await this.prisma.gthComunicacionesRecord.upsert({
            where: { externalRowKey: row.externalRowKey },
            create: {
              externalRowKey: row.externalRowKey,
              documentId: row.documentId ?? snapshot.documentId,
              fullName: snapshot.fullName,
              cargo: snapshot.cargo ?? '',
              payload: row.payload,
              isActive,
              lastSyncedAt: syncedAt,
            },
            update: {
              documentId: row.documentId ?? snapshot.documentId,
              fullName: snapshot.fullName,
              cargo: snapshot.cargo ?? '',
              payload: row.payload,
              isActive,
              lastSyncedAt: syncedAt,
            },
          });
          upserted += 1;
        }),
      );
    }
    return upserted;
  }

  async listRecords(
    _departmentId: string,
    query: GthComunicacionesRecordsQuery,
  ): Promise<GthComunicacionesRecordsPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const includeInactive = query.includeInactive === true;

    const where: Prisma.GthComunicacionesRecordWhereInput = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    if (query.hasPhoto === 'true') {
      where.OR = [{ photoSizeBytes: { gt: 0 } }, { photoAttachmentId: { not: null } }];
    } else if (query.hasPhoto === 'false') {
      where.AND = [
        { OR: [{ photoSizeBytes: null }, { photoSizeBytes: 0 }] },
        { photoAttachmentId: null },
      ];
    }

    const q = query.q?.trim().toLowerCase() ?? '';

    const rows = await this.prisma.gthComunicacionesRecord.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      select: {
        id: true,
        externalRowKey: true,
        documentId: true,
        fullName: true,
        cargo: true,
        payload: true,
        isActive: true,
        photoAttachmentId: true,
        photoSizeBytes: true,
        photoUploadedAt: true,
        photoMimeType: true,
        photoFileName: true,
        lastSyncedAt: true,
        createdAt: true,
        photoAttachment: { select: { id: true, mimeType: true } },
      },
    });

    const areaFilter = query.area?.trim();
    const cargoFilter = query.cargo?.trim();
    const estadoFilter = query.estado?.trim();
    const tipoContratoFilter = query.tipoContrato?.trim();

    const mapped = rows
      .map((row) => ({ db: row, record: this.toRecordRow(row) }))
      .filter(({ db, record }) => {
        if (q && !this.recordMatchesSearch(record, db.payload as Record<string, unknown>, q)) {
          return false;
        }
        if (areaFilter && record.area !== areaFilter) return false;
        if (cargoFilter && record.cargo !== cargoFilter) return false;
        if (estadoFilter && record.estado !== estadoFilter) return false;
        if (tipoContratoFilter && record.tipo_contrato !== tipoContratoFilter) return false;
        return true;
      })
      .map(({ record }) => record);

    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;

    return {
      data: mapped.slice(start, start + limit),
      total,
      page: safePage,
      limit,
      total_pages: totalPages,
    };
  }

  private recordMatchesSearch(
    record: GthComunicacionesRecordRow,
    payload: Record<string, unknown>,
    q: string,
  ): boolean {
    const displayText = [
      record.full_name,
      record.document_id ?? '',
      record.document_display ?? '',
      record.cargo,
      record.area,
      record.estado,
      record.tipo_contrato,
      record.fecha_ingreso,
    ]
      .join(' ')
      .toLowerCase();

    if (displayText.includes(q)) return true;

    const qDigits = q.replace(/\D/g, '');
    if (qDigits.length >= 3 && record.document_id?.includes(qDigits)) return true;

    return buildGthPayloadSearchText(payload).includes(q);
  }

  async getFilterOptions(includeInactive?: boolean): Promise<GthComunicacionesFilterOptions> {
    const where: Prisma.GthComunicacionesRecordWhereInput = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    const rows = await this.prisma.gthComunicacionesRecord.findMany({
      where,
      select: { payload: true, cargo: true },
    });

    const sets: Record<(typeof GTH_FILTER_FIELDS)[number], Set<string>> = {
      AREA: new Set(),
      ESTADO: new Set(),
      CARGO: new Set(),
      TIPOCONTRATO: new Set(),
    };

    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const area = resolveGthFieldValue(payload, 'AREA');
      const estado = pickGthEstadoLabel(payload);
      const cargo = resolveGthFieldValue(payload, 'CARGO') || row.cargo;
      const tipoContrato = resolveGthFieldValue(payload, 'TIPOCONTRATO');

      if (area) sets.AREA.add(area);
      if (estado && estado !== '—') sets.ESTADO.add(estado);
      if (cargo) sets.CARGO.add(cargo);
      if (tipoContrato) sets.TIPOCONTRATO.add(tipoContrato);
    }

    const sort = (a: string, b: string) => a.localeCompare(b, 'es');
    return {
      AREA: [...sets.AREA].sort(sort),
      ESTADO: [...sets.ESTADO].sort(sort),
      CARGO: [...sets.CARGO].sort(sort),
      TIPOCONTRATO: [...sets.TIPOCONTRATO].sort(sort),
    };
  }

  private recordHasPhoto(row: {
    photoData?: Uint8Array | Buffer | null;
    photoAttachmentId: string | null;
    photoSizeBytes?: number | null;
  }): boolean {
    if (row.photoAttachmentId) return true;
    if ((row.photoSizeBytes ?? 0) > 0) return true;
    if (row.photoData == null) return false;
    const byteLen = Buffer.isBuffer(row.photoData) ? row.photoData.length : row.photoData.length;
    return byteLen > 0;
  }

  private toRecordRow(row: {
    id: string;
    externalRowKey: string;
    documentId: string | null;
    fullName: string;
    cargo: string;
    payload: unknown;
    isActive: boolean;
    photoAttachmentId: string | null;
    photoData?: Uint8Array | Buffer | null;
    photoSizeBytes?: number | null;
    photoUploadedAt: Date | null;
    lastSyncedAt: Date;
    createdAt: Date;
    photoAttachment?: { id: string; mimeType: string } | null;
  }): GthComunicacionesRecordRow {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const fullName = buildGthEmployeeFullName(payload);
    const cargo = resolveGthFieldValue(payload, 'CARGO');
    const hasPhoto = this.recordHasPhoto(row);
    const documentId = pickGthDocumentId(payload) ?? row.documentId;
    const documentDisplay = formatGthDocumentDisplay(payload, documentId) || documentId;
    return {
      id: row.id,
      external_row_key: row.externalRowKey,
      document_id: documentId,
      document_display: documentDisplay || null,
      full_name: fullName !== 'Empleado GTH' ? fullName : row.fullName,
      cargo: cargo || row.cargo,
      estado: pickGthEstadoLabel(payload),
      area: resolveGthFieldValue(payload, 'AREA') || '—',
      tipo_contrato: resolveGthFieldValue(payload, 'TIPOCONTRATO') || '—',
      fecha_ingreso: pickGthFingreso(payload),
      is_active: row.isActive,
      has_photo: hasPhoto,
      photo_attachment_id: hasPhoto ? row.photoAttachmentId : null,
      photo_uploaded_at: hasPhoto ? (row.photoUploadedAt?.toISOString() ?? null) : null,
      last_synced_at: row.lastSyncedAt.toISOString(),
      created_at: row.createdAt.toISOString(),
    };
  }

  private async purgeLegacyPhotoAttachment(
    attachmentId: string | null,
    storageKey: string | null,
  ): Promise<void> {
    if (!attachmentId) return;
    await this.prisma.attachment.delete({ where: { id: attachmentId } }).catch(() => undefined);
    if (storageKey) {
      try {
        await this.storage.deleteObject(storageKey);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Could not delete legacy GTH photo blob ${storageKey}: ${reason}`);
      }
    }
  }

  private photoFromDb(row: {
    photoData: Uint8Array | Buffer | null;
    photoMimeType: string | null;
    photoFileName: string | null;
  }): { buffer: Buffer; mimeType: string; originalName: string } | null {
    if (row.photoData == null || row.photoData.length === 0) return null;
    const buffer = Buffer.isBuffer(row.photoData) ? row.photoData : Buffer.from(row.photoData);
    return {
      buffer,
      mimeType: row.photoMimeType?.trim() || 'image/jpeg',
      originalName: row.photoFileName?.trim() || 'foto-gth.jpg',
    };
  }

  async uploadPhoto(
    recordId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    user: UserPayload,
  ): Promise<GthComunicacionesRecordRow> {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten imágenes.');
    }

    const record = await this.prisma.gthComunicacionesRecord.findUnique({
      where: { id: recordId },
      include: { photoAttachment: true },
    });
    if (!record) throw new NotFoundException('Registro GTH no encontrado');

    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const documentId = pickGthDocumentId(payload) ?? record.documentId;
    const photoFileName = buildGthPhotoFileName(documentId, file.mimetype, file.originalname);

    const previousAttachmentId = record.photoAttachmentId;
    const previousStorageKey = record.photoAttachment?.storageKey ?? null;

    const updated = await this.prisma.gthComunicacionesRecord.update({
      where: { id: recordId },
      data: {
        photoData: Uint8Array.from(file.buffer),
        photoMimeType: file.mimetype.slice(0, 127),
        photoFileName,
        photoSizeBytes: file.size,
        photoAttachmentId: null,
        photoUploadedAt: new Date(),
        photoUploadedByUserId: user.sub,
      },
      include: {
        photoAttachment: { select: { id: true, mimeType: true } },
      },
    });

    await this.purgeLegacyPhotoAttachment(previousAttachmentId, previousStorageKey);

    void this.gthMysqlSync.syncRecord(updated).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MySQL photo sync enqueue failed for ${recordId}: ${message}`);
    });

    return this.toRecordRow(updated);
  }

  async deletePhoto(recordId: string): Promise<GthComunicacionesRecordRow> {
    const record = await this.prisma.gthComunicacionesRecord.findUnique({
      where: { id: recordId },
      include: { photoAttachment: true },
    });
    if (!record) throw new NotFoundException('Registro GTH no encontrado');
    if (!this.recordHasPhoto(record)) {
      throw new NotFoundException('Fotografía no encontrada');
    }

    const previousAttachmentId = record.photoAttachmentId;
    const previousStorageKey = record.photoAttachment?.storageKey ?? null;

    const updated = await this.prisma.gthComunicacionesRecord.update({
      where: { id: recordId },
      data: {
        photoData: null,
        photoMimeType: null,
        photoFileName: null,
        photoSizeBytes: null,
        photoAttachmentId: null,
        photoUploadedAt: null,
        photoUploadedByUserId: null,
        mysqlPhotoSyncedAt: null,
        mysqlPhotoSyncLastError: null,
        mysqlPhotoSyncAttempts: 0,
      },
      include: {
        photoAttachment: { select: { id: true, mimeType: true } },
      },
    });

    await this.purgeLegacyPhotoAttachment(previousAttachmentId, previousStorageKey);

    void this.gthMysqlSync.deleteRecordPhoto(record).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MySQL photo delete enqueue failed for ${recordId}: ${message}`);
    });

    return this.toRecordRow(updated);
  }

  async getRecordDetail(recordId: string): Promise<GthComunicacionesRecordDetail> {
    const record = await this.prisma.gthComunicacionesRecord.findUnique({
      where: { id: recordId },
      include: {
        photoAttachment: { select: { id: true, mimeType: true } },
      },
    });
    if (!record) throw new NotFoundException('Registro GTH no encontrado');

    const payload = (record.payload ?? {}) as Record<string, unknown>;
    return {
      ...this.toRecordRow(record),
      payload,
    };
  }

  /** Indica si existe foto GTH para la cédula (sin leer storage). */
  async hasPhotoByEmployeeId(employeeId: string): Promise<boolean> {
    const trimmed = employeeId.trim();
    if (!trimmed) return false;

    const normalized = normalizeGthDocumentId(trimmed);
    const candidates = Array.from(
      new Set([trimmed, normalized].filter((value) => Boolean(value))),
    );

    const record = await this.prisma.gthComunicacionesRecord.findFirst({
      where: {
        AND: [
          {
            OR: [{ photoSizeBytes: { gt: 0 } }, { photoAttachmentId: { not: null } }],
          },
          {
            OR: candidates.flatMap((candidate) => [
              { documentId: candidate },
              { documentId: { equals: candidate, mode: 'insensitive' } },
            ]),
          },
        ],
      },
      select: { id: true, photoData: true, photoAttachmentId: true },
    });

    return record ? this.recordHasPhoto(record) : false;
  }

  /** Fotografía de carta de presentación por cédula/employee_id (login y perfil). */
  async getPhotoContentByEmployeeId(employeeId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  } | null> {
    const trimmed = employeeId.trim();
    if (!trimmed) return null;

    const normalized = normalizeGthDocumentId(trimmed);
    const candidates = Array.from(
      new Set([trimmed, normalized].filter((value) => Boolean(value))),
    );

    const record = await this.prisma.gthComunicacionesRecord.findFirst({
      where: {
        AND: [
          {
            OR: [{ photoSizeBytes: { gt: 0 } }, { photoAttachmentId: { not: null } }],
          },
          {
            OR: candidates.flatMap((candidate) => [
              { documentId: candidate },
              { documentId: { equals: candidate, mode: 'insensitive' } },
            ]),
          },
        ],
      },
      include: { photoAttachment: true },
      orderBy: [{ photoUploadedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    if (!record || !this.recordHasPhoto(record)) return null;

    const fromDb = this.photoFromDb(record);
    if (fromDb) return fromDb;

    if (!record.photoAttachment) return null;

    try {
      const buffer = await this.storage.getObjectBuffer(record.photoAttachment.storageKey);
      return {
        buffer,
        mimeType: record.photoAttachment.mimeType,
        originalName: record.photoAttachment.originalName,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Legacy GTH photo read failed for ${record.id}: ${reason}`);
      return null;
    }
  }

  async getPhotoContent(recordId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }> {
    const record = await this.prisma.gthComunicacionesRecord.findUnique({
      where: { id: recordId },
      include: { photoAttachment: true },
    });
    if (!record || !this.recordHasPhoto(record)) {
      throw new NotFoundException('Fotografía no encontrada');
    }

    const fromDb = this.photoFromDb(record);
    if (fromDb) return fromDb;

    if (!record.photoAttachment) {
      throw new NotFoundException('Fotografía no encontrada');
    }

    try {
      const buffer = await this.storage.getObjectBuffer(record.photoAttachment.storageKey);
      return {
        buffer,
        mimeType: record.photoAttachment.mimeType,
        originalName: record.photoAttachment.originalName,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`GTH record photo read failed for ${recordId}: ${reason}`);
      throw new ServiceUnavailableException('No se pudo leer la fotografía.');
    }
  }
}
