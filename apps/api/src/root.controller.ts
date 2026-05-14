import { Controller, Get } from '@nestjs/common';
import { getBuildMetadata } from './common/runtime/runtime-metadata';
import { StorageService } from './modules/storage/storage.service';

/** Respuesta en `GET /` (sin prefijo `api/v1`): dominio público suele abrir la raíz. */
@Controller()
export class RootController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  root() {
    const prefix = process.env.API_PREFIX ?? 'api/v1';
    const storageInfo = this.storage.getRuntimeInfo();
    return {
      ok: true,
      service: 'chat-tikets-api',
      hint: 'El front (Vite) se despliega con el servicio web / docker-compose; esta imagen es solo API JSON.',
      healthUrl: `/${prefix}/health`,
      readyUrl: `/${prefix}/ready`,
      docsUrl: `/${prefix}/docs`,
      ...getBuildMetadata(),
      storage_endpoint: storageInfo.endpoint,
      storage_hostname: storageInfo.hostname,
      storage_port: storageInfo.port,
      storage_protocol: storageInfo.protocol,
      storage_tls_relaxed: storageInfo.tls_relaxed,
    };
  }
}
