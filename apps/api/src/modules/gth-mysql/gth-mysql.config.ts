export type GthMysqlConfig = {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectTimeoutMs: number;
  maxSyncAttempts: number;
};

export function readGthMysqlConfig(): GthMysqlConfig | null {
  const enabled = process.env.GTH_MYSQL_ENABLED === 'true';
  if (!enabled) return null;

  const host = process.env.GTH_MYSQL_HOST?.trim() ?? '';
  const database = process.env.GTH_MYSQL_DATABASE?.trim() ?? '';
  const user = process.env.GTH_MYSQL_USER?.trim() ?? '';
  const password = process.env.GTH_MYSQL_PASSWORD ?? '';
  if (!host || !database || !user || !password) return null;

  const portRaw = Number.parseInt(process.env.GTH_MYSQL_PORT ?? '3306', 10);
  const connectTimeoutMs = Number.parseInt(process.env.GTH_MYSQL_CONNECT_TIMEOUT_MS ?? '8000', 10);
  const maxSyncAttempts = Number.parseInt(process.env.GTH_MYSQL_MAX_SYNC_ATTEMPTS ?? '20', 10);

  return {
    enabled: true,
    host,
    port: Number.isFinite(portRaw) ? portRaw : 3306,
    database,
    user,
    password,
    connectTimeoutMs: Number.isFinite(connectTimeoutMs) ? connectTimeoutMs : 8000,
    maxSyncAttempts: Number.isFinite(maxSyncAttempts) ? maxSyncAttempts : 20,
  };
}

export function gthMysqlRuntimeInfo(config: GthMysqlConfig | null) {
  return {
    gth_mysql_enabled: Boolean(config),
    gth_mysql_host: config?.host ?? null,
    gth_mysql_port: config?.port ?? null,
    gth_mysql_database: config?.database ?? null,
    gth_mysql_user: config?.user ?? null,
    gth_mysql_max_sync_attempts: config?.maxSyncAttempts ?? null,
  };
}
