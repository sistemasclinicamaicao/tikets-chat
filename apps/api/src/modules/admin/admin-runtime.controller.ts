import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { StorageService } from '../storage/storage.service';

/**
 * Valores efectivos no secretos (solo lectura). Secretos nunca se exponen aquí.
 */
@ApiTags('admin-runtime')
@ApiBearerAuth('access-token')
@Controller('admin/runtime-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminRuntimeController {
  private readonly logger = new Logger(AdminRuntimeController.name);

  constructor(private readonly storage: StorageService) {
    const storageInfo = this.storage.getRuntimeInfo();
    this.logger.log(
      `DEBUG_ADMIN_RUNTIME_BOOT ${JSON.stringify({
        hypothesisId: 'H3',
        routes: ['GET /api/v1/admin/runtime-config', 'GET /api/v1/admin/runtime-config/storage', 'GET /api/v1/admin/runtime-config/storage/probe'],
        storageEndpoint: storageInfo.endpoint,
        storageHostname: storageInfo.hostname,
        storagePort: storageInfo.port,
      })}`,
    );
    // #region agent log
    fetch('http://127.0.0.1:7274/ingest/59bdcc31-fe05-46ac-a0ca-d7ce2215562f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de3583'},body:JSON.stringify({sessionId:'de3583',runId:'quobjects-debug-v1',hypothesisId:'H3',location:'apps/api/src/modules/admin/admin-runtime.controller.ts:constructor',message:'admin runtime controller boot',data:{routes:['GET /api/v1/admin/runtime-config','GET /api/v1/admin/runtime-config/storage','GET /api/v1/admin/runtime-config/storage/probe'],storageEndpoint:storageInfo.endpoint,storageHostname:storageInfo.hostname,storagePort:storageInfo.port},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

  @Get()
  @ApiOperation({ summary: 'Parámetros de entorno visibles (sin secretos)' })
  getRuntimeConfig() {
    const rawLimit = process.env.CHAT_DIRECTORY_USER_LIMIT;
    const chatDirectoryLimitParsed = rawLimit != null && rawLimit !== '' ? Number(rawLimit) : null;
    const storageInfo = this.storage.getRuntimeInfo();
    return {
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
    };
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
