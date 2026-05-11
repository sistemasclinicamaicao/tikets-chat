import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'chat-tikets-api' };
  }

  @Get('health')
  apiHealth() {
    return { ok: true, service: 'chat-tikets-api' };
  }
}
