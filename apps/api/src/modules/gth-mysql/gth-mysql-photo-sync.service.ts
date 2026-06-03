import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeGthDocumentId, pickGthDocumentId } from '../admin/admin-gth-row.util';
import { GthHostingerMysqlService } from './gth-hostinger-mysql.service';
import { buildGthMysqlPhotoRow } from './gth-mysql-photo-row.util';

const PENDING_BATCH_SIZE = 50;
const BACKFILL_BATCH_SIZE = 25;

@Injectable()
export class GthMysqlPhotoSyncService {
  private readonly logger = new Logger(GthMysqlPhotoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mysql: GthHostingerMysqlService,
  ) {}

  async syncRecordId(recordId: string): Promise<boolean> {
    if (!this.mysql.isConfigured()) return false;

    const record = await this.prisma.gthComunicacionesRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) return false;

    return this.syncRecord(record);
  }

  async syncRecord(record: {
    id: string;
    documentId: string | null;
    fullName: string;
    payload: unknown;
    photoMimeType: string | null;
    photoData: Uint8Array | Buffer | null;
    photoUploadedAt: Date | null;
    mysqlPhotoSyncAttempts?: number;
  }): Promise<boolean> {
    if (!this.mysql.isConfigured()) return false;

    const built = buildGthMysqlPhotoRow(record);
    if (!built.ok) {
      await this.markFailure(record.id, built.error, record.mysqlPhotoSyncAttempts ?? 0);
      return false;
    }

    try {
      await this.mysql.upsertPhoto(built.row);
      await this.prisma.gthComunicacionesRecord.update({
        where: { id: record.id },
        data: {
          mysqlPhotoSyncedAt: new Date(),
          mysqlPhotoSyncLastError: null,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markFailure(record.id, message, record.mysqlPhotoSyncAttempts ?? 0);
      this.logger.warn(`MySQL sync failed for ${record.id}: ${message}`);
      return false;
    }
  }

  async deleteRecordPhoto(record: {
    id: string;
    documentId: string | null;
    payload: unknown;
  }): Promise<void> {
    if (!this.mysql.isConfigured()) return;

    const payload = (record.payload ?? {}) as Record<string, unknown>;
    const docRaw = pickGthDocumentId(payload) ?? record.documentId?.trim() ?? '';
    const cedulaDigits = normalizeGthDocumentId(docRaw);
    if (!cedulaDigits) return;

    try {
      await this.mysql.deletePhotoByCedula(cedulaDigits);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MySQL photo delete failed for ${record.id}: ${message}`);
    }
  }

  async retryPending(): Promise<{ ok: number; failed: number }> {
    if (!this.mysql.isConfigured()) return { ok: 0, failed: 0 };

    const maxAttempts = this.mysql.getMaxSyncAttempts();
    const pending = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM gth_comunicaciones_records
      WHERE photo_size_bytes > 0
        AND (mysql_photo_synced_at IS NULL OR mysql_photo_synced_at < photo_uploaded_at)
        AND mysql_photo_sync_attempts < ${maxAttempts}
      ORDER BY photo_uploaded_at DESC NULLS LAST
      LIMIT ${PENDING_BATCH_SIZE}`;

    let ok = 0;
    let failed = 0;
    for (const { id } of pending) {
      const success = await this.syncRecordId(id);
      if (success) ok += 1;
      else failed += 1;
    }
    if (ok > 0 || failed > 0) {
      this.logger.log(`MySQL retry batch: ${ok} ok, ${failed} failed`);
    }
    return { ok, failed };
  }

  /** Copia todas las fotos con photo_data en Postgres hacia MySQL (backfill admin). */
  async backfillAll(): Promise<{
    ok: number;
    skipped: number;
    failed: number;
    total: number;
    photo_count: number | null;
  }> {
    if (!this.mysql.isConfigured()) {
      return { ok: 0, skipped: 0, failed: 0, total: 0, photo_count: null };
    }

    let cursor: string | undefined;
    let total = 0;
    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (;;) {
      const rows = await this.prisma.gthComunicacionesRecord.findMany({
        where: { photoSizeBytes: { gt: 0 } },
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        total += 1;
        const success = await this.syncRecord(row);
        if (success) {
          ok += 1;
        } else {
          const built = buildGthMysqlPhotoRow(row);
          if (!built.ok) skipped += 1;
          else failed += 1;
        }
      }

      cursor = rows[rows.length - 1]?.id;
      if (rows.length < BACKFILL_BATCH_SIZE) break;
    }

    const photo_count = await this.mysql.countPhotos();
    this.logger.log(`MySQL backfill: ${ok} ok, ${skipped} skipped, ${failed} failed (${total} processed)`);
    return { ok, skipped, failed, total, photo_count };
  }

  private async markFailure(recordId: string, error: string, attempts: number): Promise<void> {
    const trimmed = error.trim().slice(0, 500);
    await this.prisma.gthComunicacionesRecord.update({
      where: { id: recordId },
      data: {
        mysqlPhotoSyncLastError: trimmed || 'Error desconocido',
        mysqlPhotoSyncAttempts: attempts + 1,
      },
    });
  }
}
