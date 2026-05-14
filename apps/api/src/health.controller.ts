import { Controller, Get } from '@nestjs/common';
import { StorageService } from './modules/storage/storage.service';

@Controller()
export class HealthController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  health() {
    const storageInfo = this.storage.getRuntimeInfo();
    return {
      ok: true,
      service: 'chat-tikets-api',
      debug_build_marker: 'quobjects-debug-v2',
      storage_endpoint: storageInfo.endpoint,
      storage_hostname: storageInfo.hostname,
      storage_port: storageInfo.port,
      storage_protocol: storageInfo.protocol,
      storage_tls_relaxed: storageInfo.tls_relaxed,
    };
  }

  @Get('health')
  apiHealth() {
    const storageInfo = this.storage.getRuntimeInfo();
    return {
      ok: true,
      service: 'chat-tikets-api',
      debug_build_marker: 'quobjects-debug-v2',
      storage_endpoint: storageInfo.endpoint,
      storage_hostname: storageInfo.hostname,
      storage_port: storageInfo.port,
      storage_protocol: storageInfo.protocol,
      storage_tls_relaxed: storageInfo.tls_relaxed,
    };
  }
}
