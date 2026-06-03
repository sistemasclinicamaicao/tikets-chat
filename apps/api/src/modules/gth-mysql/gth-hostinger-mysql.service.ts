import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import { gthMysqlRuntimeInfo, readGthMysqlConfig, type GthMysqlConfig } from './gth-mysql.config';
import type { GthMysqlPhotoRow } from './gth-mysql-photo-row.util';

const GTH_FOTOS_DDL = `
CREATE TABLE gth_fotos (
  cedula_digits VARCHAR(32) NOT NULL PRIMARY KEY,
  tipo_documento VARCHAR(32) NULL,
  documento_display VARCHAR(64) NULL,
  nombre VARCHAR(255) NULL,
  mime_type VARCHAR(127) NOT NULL,
  foto LONGBLOB NOT NULL,
  record_id CHAR(36) NULL,
  actualizado_en DATETIME NOT NULL,
  INDEX idx_actualizado (actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

@Injectable()
export class GthHostingerMysqlService implements OnModuleDestroy {
  private readonly logger = new Logger(GthHostingerMysqlService.name);
  private readonly config: GthMysqlConfig | null;
  private pool: Pool | null = null;

  constructor() {
    this.config = readGthMysqlConfig();
    if (this.config) {
      this.pool = createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        waitForConnections: true,
        connectionLimit: 4,
        connectTimeout: this.config.connectTimeoutMs,
        enableKeepAlive: true,
      });
      this.logger.log(`MySQL GTH habilitado (${this.config.host}:${this.config.port}/${this.config.database})`);
    } else if (process.env.GTH_MYSQL_ENABLED === 'true') {
      this.logger.warn(
        'GTH_MYSQL_ENABLED=true pero falta host, database, user o password — réplica MySQL desactivada',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  isConfigured(): boolean {
    return Boolean(this.config && this.pool);
  }

  getRuntimeInfo() {
    return gthMysqlRuntimeInfo(this.config);
  }

  getMaxSyncAttempts(): number {
    return this.config?.maxSyncAttempts ?? 20;
  }

  async ping(): Promise<{ ok: boolean; error?: string }> {
    if (!this.pool) {
      return { ok: false, error: 'GTH MySQL no configurado' };
    }
    try {
      await this.pool.query('SELECT 1');
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  /** Recrea gth_fotos con el esquema esperado (destructivo si ya existía). */
  async ensureSchema(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DROP TABLE IF EXISTS gth_fotos');
    await this.pool.query(GTH_FOTOS_DDL);
    this.logger.log('Tabla MySQL gth_fotos creada/actualizada');
  }

  async upsertPhoto(row: GthMysqlPhotoRow): Promise<void> {
    if (!this.pool) return;

    await this.pool.execute(
      `INSERT INTO gth_fotos (
        cedula_digits, tipo_documento, documento_display, nombre,
        mime_type, foto, record_id, actualizado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        tipo_documento = VALUES(tipo_documento),
        documento_display = VALUES(documento_display),
        nombre = VALUES(nombre),
        mime_type = VALUES(mime_type),
        foto = VALUES(foto),
        record_id = VALUES(record_id),
        actualizado_en = VALUES(actualizado_en)`,
      [
        row.cedulaDigits,
        row.tipoDocumento,
        row.documentoDisplay,
        row.nombre,
        row.mimeType,
        row.foto,
        row.recordId,
        row.actualizadoEn,
      ],
    );
  }

  async countPhotos(): Promise<number | null> {
    if (!this.pool) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM gth_fotos');
    const first = rows[0] as { c?: number } | undefined;
    return Number(first?.c ?? 0);
  }

  async deletePhotoByCedula(cedulaDigits: string): Promise<void> {
    if (!this.pool || !cedulaDigits.trim()) return;
    await this.pool.execute('DELETE FROM gth_fotos WHERE cedula_digits = ?', [cedulaDigits.trim()]);
  }
}
