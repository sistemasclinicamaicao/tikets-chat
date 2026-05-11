/** Línea JSON única en stdout: eventos de dominio (quién hizo qué). */
export type AuditDomainEvent = {
  type: 'audit';
  ts: string;
  action: string;
  actorUserId?: string | null;
  resource?: string;
  meta?: Record<string, unknown>;
};

/** Línea JSON: tráfico HTTP (sin cuerpo ni cabeceras sensibles). */
export type HttpAccessEvent = {
  type: 'http_access';
  ts: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  actorUserId?: string | null;
};
