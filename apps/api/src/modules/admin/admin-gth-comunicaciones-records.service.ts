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
              area: snapshot.area,
              estado: snapshot.estado,
              tipoContrato: snapshot.tipoContrato,
              fechaIngreso: snapshot.fechaIngreso,
              payload: row.payload,
              isActive,
              lastSyncedAt: syncedAt,
            },
            update: {
              documentId: row.documentId ?? snapshot.documentId,
              fullName: snapshot.fullName,
              cargo: snapshot.cargo ?? '',
              area: snapshot.area,
              estado: snapshot.estado,
              tipoContrato: snapshot.tipoContrato,
              fechaIngreso: snapshot.fechaIngreso,
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

  private buildListWhere(query: GthComunicacionesRecordsQuery): Prisma.GthComunicacionesRecordWhereInput {
    const includeInactive = query.includeInactive === true;
    const and: Prisma.GthComunicacionesRecordWhereInput[] = [];

    if (!includeInactive) {
      and.push({ isActive: true });
    }

    if (query.hasPhoto === 'true') {
      and.push({ OR: [{ photoSizeBytes: { gt: 0 } }, { photoAttachmentId: { not: null } }] });
    } else if (query.hasPhoto === 'false') {
      and.push({
        AND: [
          { OR: [{ photoSizeBytes: null }, { photoSizeBytes: 0 }] },
          { photoAttachmentId: null },
        ],
      });
    }

    const areaFilter = query.area?.trim();
    const cargoFilter = query.cargo?.trim();
    const estadoFilter = query.estado?.trim();
    const tipoContratoFilter = query.tipoContrato?.trim();
    if (areaFilter) and.push({ area: areaFilter });
    if (cargoFilter) and.push({ cargo: cargoFilter });
    if (estadoFilter) and.push({ estado: estadoFilter });
    if (tipoContratoFilter) and.push({ tipoContrato: tipoContratoFilter });

    const q = query.q?.trim();
    if (q) {
      const qLower = q.toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      const or: Prisma.GthComunicacionesRecordWhereInput[] = [
        { fullName: { contains: qLower, mode: 'insensitive' } },
        { cargo: { contains: qLower, mode: 'insensitive' } },
        { area: { contains: qLower, mode: 'insensitive' } },
        { estado: { contains: qLower, mode: 'insensitive' } },
        { tipoContrato: { contains: qLower, mode: 'insensitive' } },
        { fechaIngreso: { contains: qLower, mode: 'insensitive' } },
      ];
      if (qDigits.length >= 3) {
        or.push({ documentId: { contains: qDigits, mode: 'insensitive' } });
      } else {
        or.push({ documentId: { contains: qLower, mode: 'insensitive' } });
      }
      and.push({ OR: or });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private static readonly listRecordSelect = {
    id: true,
    externalRowKey: true,
    documentId: true,
    fullName: true,
    cargo: true,
    area: true,
    estado: true,
    tipoContrato: true,
    fechaIngreso: true,
    isActive: true,
    photoAttachmentId: true,
    photoSizeBytes: true,
    photoUploadedAt: true,
    photoMimeType: true,
    photoFileName: true,
    lastSyncedAt: true,
    createdAt: true,
    photoAttachment: { select: { id: true, mimeType: true } },
  } as const;

  async listRecords(
    _departmentId: string,
    query: GthComunicacionesRecordsQuery,
  ): Promise<GthComunicacionesRecordsPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = this.buildListWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.gthComunicacionesRecord.count({ where }),
      this.prisma.gthComunicacionesRecord.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: AdminGthComunicacionesRecordsService.listRecordSelect,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = total > 0 ? Math.min(page, totalPages) : 1;

    return {
      data: rows.map((row) => this.toRecordRow(row)),
      total,
      page: safePage,
      limit,
      total_pages: totalPages,
    };
  }

  async getFilterOptions(includeInactive?: boolean): Promise<GthComunicacionesFilterOptions> {
    const where: Prisma.GthComunicacionesRecordWhereInput = includeInactive ? {} : { isActive: true };
    const sort = (a: string, b: string) => a.localeCompare(b, 'es');

    const [areas, estados, cargos, tipos] = await Promise.all([
      this.prisma.gthComunicacionesRecord.findMany({
        where: { ...where, area: { not: '—' } },
        distinct: ['area'],
        select: { area: true },
        orderBy: { area: 'asc' },
      }),
      this.prisma.gthComunicacionesRecord.findMany({
        where: { ...where, estado: { not: '—' } },
        distinct: ['estado'],
        select: { estado: true },
        orderBy: { estado: 'asc' },
      }),
      this.prisma.gthComunicacionesRecord.findMany({
        where: { ...where, cargo: { not: '' } },
        distinct: ['cargo'],
        select: { cargo: true },
        orderBy: { cargo: 'asc' },
      }),
      this.prisma.gthComunicacionesRecord.findMany({
        where: { ...where, tipoContrato: { not: '—' } },
        distinct: ['tipoContrato'],
        select: { tipoContrato: true },
        orderBy: { tipoContrato: 'asc' },
      }),
    ]);

    return {
      AREA: areas.map((r) => r.area).sort(sort),
      ESTADO: estados.map((r) => r.estado).sort(sort),
      CARGO: cargos.map((r) => r.cargo).sort(sort),
      TIPOCONTRATO: tipos.map((r) => r.tipoContrato).sort(sort),
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

  private toRecordRow(
    row: {
      id: string;
      externalRowKey: string;
      documentId: string | null;
      fullName: string;
      cargo: string;
      area?: string;
      estado?: string;
      tipoContrato?: string;
      fechaIngreso?: string;
      payload?: unknown;
      isActive: boolean;
      photoAttachmentId: string | null;
      photoData?: Uint8Array | Buffer | null;
      photoSizeBytes?: number | null;
      photoUploadedAt: Date | null;
      lastSyncedAt: Date;
      createdAt: Date;
      photoAttachment?: { id: string; mimeType: string } | null;
    },
  ): GthComunicacionesRecordRow {
    const payload = row.payload != null ? ((row.payload ?? {}) as Record<string, unknown>) : null;
    const hasPhoto = this.recordHasPhoto(row);
    const documentId =
      (payload ? pickGthDocumentId(payload) : null) ?? row.documentId;
    const documentDisplay =
      (payload ? formatGthDocumentDisplay(payload, documentId) : null) || documentId;
    const fullNameFromPayload = payload ? buildGthEmployeeFullName(payload) : null;
    return {
      id: row.id,
      external_row_key: row.externalRowKey,
      document_id: documentId,
      document_display: documentDisplay || null,
      full_name:
        fullNameFromPayload && fullNameFromPayload !== 'Empleado GTH'
          ? fullNameFromPayload
          : row.fullName,
      cargo: (payload ? resolveGthFieldValue(payload, 'CARGO') : '') || row.cargo,
      estado: row.estado ?? (payload ? pickGthEstadoLabel(payload) : '—'),
      area: row.area ?? (payload ? resolveGthFieldValue(payload, 'AREA') || '—' : '—'),
      tipo_contrato:
        row.tipoContrato ??
        (payload ? resolveGthFieldValue(payload, 'TIPOCONTRATO') || '—' : '—'),
      fecha_ingreso:
        row.fechaIngreso ?? (payload ? pickGthFingreso(payload) : '—'),
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
