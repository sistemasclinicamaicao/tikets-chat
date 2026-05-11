/**
 * Trazas opcionales en el navegador para depuración / correlación con logs de API.
 * No sustituye auditoría en servidor. Activar solo en entornos controlados.
 */
export function auditClientEvent(
  action: string,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (import.meta.env.VITE_ENABLE_CLIENT_AUDIT_LOG !== 'true') return;
  const line = {
    type: 'client_audit',
    ts: new Date().toISOString(),
    action,
    ...meta,
  };
  console.info('[audit]', JSON.stringify(line));
}
