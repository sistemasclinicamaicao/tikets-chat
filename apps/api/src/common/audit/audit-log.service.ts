import { Injectable, Logger } from '@nestjs/common';
import type { AuditDomainEvent, HttpAccessEvent } from './audit.types';

/**
 * Registro estructurado para auditoría y agregadores (una línea JSON por evento en stdout).
 * Extender: inyectar `AuditLogService` y llamar `record()` en servicios (tickets, chat crítico, etc.).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');
  private readonly domainEnabled: boolean;

  constructor() {
    this.domainEnabled = process.env.AUDIT_LOG_ENABLED !== 'false';
  }

  isDomainAuditEnabled(): boolean {
    return this.domainEnabled;
  }

  /** Evento de negocio / seguridad (login, cambios de estado, etc.). */
  record(payload: Omit<AuditDomainEvent, 'type' | 'ts'> & { action: string }): void {
    if (!this.domainEnabled) return;
    const line: AuditDomainEvent = {
      type: 'audit',
      ts: new Date().toISOString(),
      action: payload.action,
      actorUserId: payload.actorUserId ?? null,
      resource: payload.resource,
      meta: payload.meta,
    };
    this.logger.log(JSON.stringify(line));
  }

  /** Llamado por el interceptor de acceso HTTP (si HTTP_ACCESS_LOG=true). */
  writeHttpAccess(payload: Omit<HttpAccessEvent, 'type' | 'ts'>): void {
    const line: HttpAccessEvent = {
      type: 'http_access',
      ts: new Date().toISOString(),
      method: payload.method,
      path: payload.path,
      statusCode: payload.statusCode,
      durationMs: payload.durationMs,
      actorUserId: payload.actorUserId ?? null,
    };
    this.logger.log(JSON.stringify(line));
  }
}
