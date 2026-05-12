import { Controller, Get } from '@nestjs/common';

/** Respuesta en `GET /` (sin prefijo `api/v1`): dominio público suele abrir la raíz. */
@Controller()
export class RootController {
  @Get()
  root() {
    const prefix = process.env.API_PREFIX ?? 'api/v1';
    return {
      ok: true,
      service: 'chat-tikets-api',
      hint: 'El front (Vite) se despliega con el servicio web / docker-compose; esta imagen es solo API JSON.',
      healthUrl: `/${prefix}/health`,
      docsUrl: `/${prefix}/docs`,
    };
  }
}
