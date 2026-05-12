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
  console.log(`API running on http://localhost:${port}`);
  console.log(
    `Inventario: GET ${apiPrefix}/inventory/departments/:departmentId/assets (ver también ${apiPrefix}/docs, tag «inventory»)`,
  );
}

bootstrap();
