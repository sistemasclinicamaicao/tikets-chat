import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { isProductionNodeEnv } from './common/runtime/production-security';
import { getBuildMetadata } from './common/runtime/runtime-metadata';
import { StorageService } from './modules/storage/storage.service';

@Controller()
export class HealthController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  health() {
    if (isProductionNodeEnv()) {
      return {
        ok: true,
        service: 'chat-tikets-api',
        status: 'live',
      };
    }
    const storageInfo = this.storage.getRuntimeInfo();
    return {
      ok: true,
      service: 'chat-tikets-api',
      status: 'live',
      ...getBuildMetadata(),
      storage_endpoint: storageInfo.endpoint,
      storage_hostname: storageInfo.hostname,
      storage_port: storageInfo.port,
      storage_protocol: storageInfo.protocol,
      storage_tls_relaxed: storageInfo.tls_relaxed,
    };
  }

  @Get('ready')
  async ready() {
    const startedAt = Date.now();
    const db = await this.probeDatabase();
    const storage = await this.storage.probeConnection();
    const storageOk = storage.tcp.ok && 'ok' in storage.bucket_head && storage.bucket_head.ok;
    const ok = db.ok && storageOk;

    const payload = {
      ok,
      service: 'chat-tikets-api',
      status: ok ? 'ready' : 'degraded',
      ...getBuildMetadata(),
      db,
      storage,
      duration_ms: Date.now() - startedAt,
    };

    if (!ok) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }

  private async probeDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
