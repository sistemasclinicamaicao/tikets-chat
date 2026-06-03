import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { getBuildMetadata } from '../../common/runtime/runtime-metadata';
import { StorageService } from '../storage/storage.service';
import { GthHostingerMysqlService } from '../gth-mysql/gth-hostinger-mysql.service';
import { GthMysqlPhotoSyncService } from '../gth-mysql/gth-mysql-photo-sync.service';

/**
 * Valores efectivos no secretos (solo lectura). Secretos nunca se exponen aquí.
 */
@ApiTags('admin-runtime')
@ApiBearerAuth('access-token')
@Controller('admin/runtime-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminRuntimeController {
  constructor(
    private readonly storage: StorageService,
    private readonly gthMysql: GthHostingerMysqlService,
    private readonly gthMysqlSync: GthMysqlPhotoSyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Parámetros de entorno visibles (sin secretos)' })
  getRuntimeConfig() {
    const rawLimit = process.env.CHAT_DIRECTORY_USER_LIMIT;
    const chatDirectoryLimitParsed = rawLimit != null && rawLimit !== '' ? Number(rawLimit) : null;
    const storageInfo = this.storage.getRuntimeInfo();
    return {
      ...getBuildMetadata(),
      api_prefix: process.env.API_PREFIX ?? 'api/v1',
      chat_directory_user_limit_raw: rawLimit ?? null,
      chat_directory_user_limit_effective:
        chatDirectoryLimitParsed != null && Number.isFinite(chatDirectoryLimitParsed)
          ? Math.min(500_000, Math.max(1, chatDirectoryLimitParsed))
          : null,
      chat_attachment_image_max_mb: Number.parseInt(process.env.CHAT_ATTACHMENT_IMAGE_MAX_MB ?? '', 10) || 10,
      chat_attachment_video_max_mb: Number.parseInt(process.env.CHAT_ATTACHMENT_VIDEO_MAX_MB ?? '', 10) || 100,
      chat_attachment_file_max_mb: Number.parseInt(process.env.CHAT_ATTACHMENT_FILE_MAX_MB ?? '', 10) || 25,
      audit_log_enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
      http_access_log: process.env.HTTP_ACCESS_LOG === 'true',
      jwt_configured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET !== 'dev_jwt_secret'),
      minio_endpoint_configured: Boolean(process.env.MINIO_ENDPOINT),
      database_configured: Boolean(process.env.DATABASE_URL),
      storage_endpoint: storageInfo.endpoint,
      storage_protocol: storageInfo.protocol,
      storage_hostname: storageInfo.hostname,
      storage_port: storageInfo.port,
      storage_bucket: storageInfo.bucket,
      storage_region: storageInfo.region,
      storage_tls_relaxed: storageInfo.tls_relaxed,
      storage_endpoint_looks_local: storageInfo.endpoint_looks_local,
      storage_hostname_kind: storageInfo.hostname_kind,
      storage_using_default_bucket: storageInfo.using_default_bucket,
      storage_using_default_credentials: storageInfo.using_default_credentials,
      storage_max_attempts: storageInfo.max_attempts,
      storage_connect_timeout_ms: storageInfo.connect_timeout_ms,
      storage_socket_timeout_ms: storageInfo.socket_timeout_ms,
      ...this.gthMysql.getRuntimeInfo(),
    };
  }

  @Get('gth-mysql/probe')
  @ApiOperation({ summary: 'Prueba de conectividad API -> MySQL Hostinger (GTH fotos)' })
  async probeGthMysql() {
    const info = this.gthMysql.getRuntimeInfo();
    if (!info.gth_mysql_enabled) {
      return { ...info, ok: false, error: 'GTH MySQL no configurado' };
    }
    const ping = await this.gthMysql.ping();
    const count = ping.ok ? await this.gthMysql.countPhotos() : null;
    return { ...info, ok: ping.ok, error: ping.error ?? null, photo_count: count };
  }

  @Post('gth-mysql/sync')
  @ApiOperation({ summary: 'Backfill: copiar fotos GTH desde Postgres hacia MySQL Hostinger' })
  async syncGthMysqlPhotos() {
    const info = this.gthMysql.getRuntimeInfo();
    if (!info.gth_mysql_enabled) {
      return { ...info, ok: false, error: 'GTH MySQL no configurado' };
    }
    const ping = await this.gthMysql.ping();
    if (!ping.ok) {
      return { ...info, ok: false, error: ping.error ?? 'MySQL no accesible' };
    }
    const result = await this.gthMysqlSync.backfillAll();
    const failures = await this.gthMysqlSync.getRecentSyncFailures(10);
    return {
      ...info,
      ok: true,
      error: null,
      synced: result.ok,
      skipped: result.skipped,
      failed: result.failed,
      total: result.total,
      photo_count: result.photo_count,
      failures,
    };
  }

  @Get('gth-mysql/status')
  @ApiOperation({ summary: 'Estado de sincronización GTH fotos → MySQL' })
  async gthMysqlSyncStatus() {
    const info = this.gthMysql.getRuntimeInfo();
    const failures = await this.gthMysqlSync.getRecentSyncFailures(15);
    const photo_count = info.gth_mysql_enabled ? await this.gthMysql.countPhotos() : null;
    return { ...info, photo_count, failures };
  }

  @Get('storage')
  @ApiOperation({ summary: 'Configuración efectiva del storage (sin secretos)' })
  getStorageConfig() {
    return this.storage.getRuntimeInfo();
  }

  @Get('storage/probe')
  @ApiOperation({ summary: 'Prueba de conectividad API -> QuObjects/S3 (sin escribir objetos)' })
  async probeStorage() {
    return this.storage.probeConnection();
  }
}
