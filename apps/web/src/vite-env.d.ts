/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen base del backend Nest (mismo host que Socket.IO). */
  readonly VITE_API_ORIGIN?: string;
  /** Si es "true", `auditClientEvent` escribe JSON en consola (solo depuración). */
  readonly VITE_ENABLE_CLIENT_AUDIT_LOG?: string;
}
