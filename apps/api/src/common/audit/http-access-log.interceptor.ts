import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { UserPayload } from '../auth/jwt-user.payload';
import { AuditLogService } from './audit-log.service';

function pathWithoutQuery(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

function shouldSkipPath(path: string): boolean {
  const raw = process.env.HTTP_ACCESS_LOG_SKIP_PATHS ?? '/health,/docs';
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.some((p) => path.includes(p));
}

@Injectable()
export class HttpAccessLogInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    if (process.env.HTTP_ACCESS_LOG !== 'true') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: UserPayload }>();
    const res = http.getResponse<Response>();
    const path = pathWithoutQuery(req.originalUrl ?? req.url ?? '');
    if (shouldSkipPath(path)) {
      return next.handle();
    }

    const start = Date.now();
    const method = req.method;
    const actorUserId = req.user?.userId ?? null;

    return next.handle().pipe(
      tap({
        finalize: () => {
          const durationMs = Date.now() - start;
          this.audit.writeHttpAccess({
            method,
            path,
            statusCode: res.statusCode,
            durationMs,
            actorUserId,
          });
        },
      }),
    );
  }
}
