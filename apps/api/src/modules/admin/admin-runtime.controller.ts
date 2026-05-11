import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';

/**
 * Valores efectivos no secretos (solo lectura). Secretos nunca se exponen aquí.
 */
@ApiTags('admin-runtime')
@ApiBearerAuth('access-token')
@Controller('admin/runtime-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminRuntimeController {
  @Get()
  @ApiOperation({ summary: 'Parámetros de entorno visibles (sin secretos)' })
  getRuntimeConfig() {
    const rawLimit = process.env.CHAT_DIRECTORY_USER_LIMIT;
    const chatDirectoryLimitParsed = rawLimit != null && rawLimit !== '' ? Number(rawLimit) : null;
    return {
      api_prefix: process.env.API_PREFIX ?? 'api/v1',
      chat_directory_user_limit_raw: rawLimit ?? null,
      chat_directory_user_limit_effective:
        chatDirectoryLimitParsed != null && Number.isFinite(chatDirectoryLimitParsed)
          ? Math.min(500_000, Math.max(1, chatDirectoryLimitParsed))
          : null,
      chat_attachment_max_mb: 10,
      audit_log_enabled: process.env.AUDIT_LOG_ENABLED !== 'false',
      http_access_log: process.env.HTTP_ACCESS_LOG === 'true',
      jwt_configured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET !== 'dev_jwt_secret'),
      minio_endpoint_configured: Boolean(process.env.MINIO_ENDPOINT),
      database_configured: Boolean(process.env.DATABASE_URL),
    };
  }
}
