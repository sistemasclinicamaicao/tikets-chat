import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { GthIncomingRow } from './admin-gth-directory.service';
import {
  buildGthEmployeeFullName,
  buildGthEmployeeSnapshot,
  buildGthPayloadSearchText,
  isGthEmployeeActiveByEstado,
  normalizeGthDocumentId,
  pickGthDocumentId,
  pickGthEstadoLabel,
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
  full_name: string;
  cargo: string;
  estado: string;
  area: string;
  tipo_contrato: string;
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
      where.photoAttachmentId = { not: null };
    } else if (query.hasPhoto === 'false') {
      where.photoAttachmentId = null;
    }

    const q = query.q?.trim().toLowerCase() ?? '';

    const rows = await this.prisma.gthComunicacionesRecord.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      include: {
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
      record.cargo,
      record.area,
      record.estado,
      record.tipo_contrato,
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

  private toRecordRow(row: {
    id: string;
    externalRowKey: string;
    documentId: string | null;
    fullName: string;
    cargo: string;
    payload: unknown;
    isActive: boolean;
    photoAttachmentId: string | null;
    photoUploadedAt: Date | null;
    lastSyncedAt: Date;
    createdAt: Date;
    photoAttachment: { id: string; mimeType: string } | null;
  }): GthComunicacionesRecordRow {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const fullName = buildGthEmployeeFullName(payload);
    const cargo = resolveGthFieldValue(payload, 'CARGO');
    return {
      id: row.id,
      external_row_key: row.externalRowKey,
      document_id: pickGthDocumentId(payload) ?? row.documentId,
      full_name: fullName !== 'Empleado GTH' ? fullName : row.fullName,
      cargo: cargo || row.cargo,
      estado: pickGthEstadoLabel(payload),
      area: resolveGthFieldValue(payload, 'AREA') || '—',
      tipo_contrato: resolveGthFieldValue(payload, 'TIPOCONTRATO') || '—',
      is_active: row.isActive,
      has_photo: Boolean(row.photoAttachmentId),
      photo_attachment_id: row.photoAttachmentId,
      photo_uploaded_at: row.photoUploadedAt?.toISOString() ?? null,
      last_synced_at: row.lastSyncedAt.toISOString(),
      created_at: row.createdAt.toISOString(),
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

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const storageKey = `gth/comunicaciones/${recordId}/${Date.now()}-${randomUUID()}-${safeName}`;

    try {
      await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`GTH record photo upload failed for ${recordId}: ${reason}`);
      throw new ServiceUnavailableException('No se pudo subir la fotografía al almacenamiento.');
    }

    const previousAttachmentId = record.photoAttachmentId;
    const previousStorageKey = record.photoAttachment?.storageKey ?? null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          storageKey,
          originalName: file.originalname.slice(0, 255),
          mimeType: file.mimetype.slice(0, 127),
          sizeBytes: file.size,
        },
      });

      const row = await tx.gthComunicacionesRecord.update({
        where: { id: recordId },
        data: {
          photoAttachmentId: attachment.id,
          photoUploadedAt: new Date(),
          photoUploadedByUserId: user.sub,
        },
        include: {
          photoAttachment: { select: { id: true, mimeType: true } },
        },
      });

      if (previousAttachmentId && previousAttachmentId !== attachment.id) {
        await tx.attachment.delete({ where: { id: previousAttachmentId } }).catch(() => undefined);
      }

      return row;
    });

    if (previousStorageKey && previousStorageKey !== storageKey) {
      try {
        await this.storage.deleteObject(previousStorageKey);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Could not delete old GTH photo blob ${previousStorageKey}: ${reason}`);
      }
    }

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
        photoAttachmentId: { not: null },
        OR: candidates.flatMap((candidate) => [
          { documentId: candidate },
          { documentId: { equals: candidate, mode: 'insensitive' } },
        ]),
      },
      select: { id: true },
    });

    return Boolean(record);
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
        photoAttachmentId: { not: null },
        OR: candidates.flatMap((candidate) => [
          { documentId: candidate },
          { documentId: { equals: candidate, mode: 'insensitive' } },
        ]),
      },
      include: { photoAttachment: true },
      orderBy: [{ photoUploadedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    if (!record?.photoAttachment) return null;

    const buffer = await this.storage.getObjectBuffer(record.photoAttachment.storageKey);
    return {
      buffer,
      mimeType: record.photoAttachment.mimeType,
      originalName: record.photoAttachment.originalName,
    };
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
    if (!record?.photoAttachment) {
      throw new NotFoundException('Fotografía no encontrada');
    }

    const buffer = await this.storage.getObjectBuffer(record.photoAttachment.storageKey);
    return {
      buffer,
      mimeType: record.photoAttachment.mimeType,
      originalName: record.photoAttachment.originalName,
    };
  }
}
