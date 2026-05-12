import { NestFactory } from '@nestjs/core';
import { LogLevel, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { validationExceptionFactory } from './common/validation/validation-errors-i18n';
import { AppModule } from './app.module';

function parseLogLevels(): LogLevel[] {
  const raw = process.env.LOG_LEVEL?.trim();
  if (!raw) return ['error', 'warn', 'log'];
  const allowed = new Set<LogLevel>(['error', 'warn', 'log', 'debug', 'verbose']);
  const levels = raw.split(',').map((s) => s.trim().toLowerCase()) as LogLevel[];
  const out = levels.filter((l) => allowed.has(l));
  return out.length > 0 ? out : ['error', 'warn', 'log'];
}

async function bootstrap() {
  // #region agent log
  const _dbg = {
    sessionId: 'de3583',
    hypothesisId: 'H3',
    location: 'main.ts:bootstrap',
    message: 'nest_bootstrap_enter',
    data: { port: process.env.PORT ?? '3030', nodeEnv: process.env.NODE_ENV ?? '' },
    timestamp: Date.now(),
  };
  console.log(JSON.stringify(_dbg));
  fetch('http://127.0.0.1:7274/ingest/59bdcc31-fe05-46ac-a0ca-d7ce2215562f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'de3583' },
    body: JSON.stringify(_dbg),
  }).catch(() => {});
  // #endregion

  const app = await NestFactory.create(AppModule, { logger: parseLogLevels() });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true, credentials: true });
  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/favicon.ico', (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chat Tickets API')
    .setDescription('API empresarial: tickets, chat, autenticación')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = Number(process.env.PORT) || 3030;
  await app.listen(port, '0.0.0.0');
  // #region agent log
  const _dbgListen = {
    sessionId: 'de3583',
    hypothesisId: 'H1',
    location: 'main.ts:listen',
    message: 'nest_listen_ok',
    data: { port, host: '0.0.0.0' },
    timestamp: Date.now(),
  };
  console.log(JSON.stringify(_dbgListen));
  fetch('http://127.0.0.1:7274/ingest/59bdcc31-fe05-46ac-a0ca-d7ce2215562f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'de3583' },
    body: JSON.stringify(_dbgListen),
  }).catch(() => {});
  // #endregion
  console.log(`API running on http://localhost:${port}`);
  console.log(
    `Inventario: GET ${apiPrefix}/inventory/departments/:departmentId/assets (ver también ${apiPrefix}/docs, tag «inventory»)`,
  );
}

bootstrap();
