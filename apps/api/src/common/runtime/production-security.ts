const DEV_JWT_SECRET = 'dev_jwt_secret';
const DEV_JWT_REFRESH_SECRET = 'dev_refresh_secret_change_me';

export type ProductionSecurityConfig = {
  isProduction: boolean;
  jwtSecret: string;
  jwtRefreshSecret: string;
  corsOrigins: string[] | true;
};

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readProductionSecurityConfig(): ProductionSecurityConfig {
  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  const jwtSecret = process.env.JWT_SECRET?.trim() || DEV_JWT_SECRET;
  const jwtRefreshSecret =
    process.env.JWT_REFRESH_SECRET?.trim() || DEV_JWT_REFRESH_SECRET;

  if (isProduction) {
    if (!process.env.JWT_SECRET?.trim() || jwtSecret === DEV_JWT_SECRET) {
      throw new Error(
        'En producción debe definir JWT_SECRET (distinto del valor de desarrollo).',
      );
    }
    if (
      !process.env.JWT_REFRESH_SECRET?.trim() ||
      jwtRefreshSecret === DEV_JWT_REFRESH_SECRET
    ) {
      throw new Error(
        'En producción debe definir JWT_REFRESH_SECRET (distinto del valor de desarrollo).',
      );
    }
    const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
    if (corsOrigins.length === 0) {
      throw new Error(
        'En producción debe definir CORS_ORIGINS (URLs separadas por coma, p. ej. el dominio del front).',
      );
    }
    return {
      isProduction: true,
      jwtSecret,
      jwtRefreshSecret,
      corsOrigins,
    };
  }

  const devOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  return {
    isProduction: false,
    jwtSecret,
    jwtRefreshSecret,
    corsOrigins: devOrigins.length > 0 ? devOrigins : true,
  };
}

export function getJwtSecrets(): { accessSecret: string; refreshSecret: string } {
  const cfg = readProductionSecurityConfig();
  return { accessSecret: cfg.jwtSecret, refreshSecret: cfg.jwtRefreshSecret };
}

export function isProductionNodeEnv(): boolean {
  return (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

export function isGthMysqlEnsureSchemaAllowed(): boolean {
  return process.env.GTH_MYSQL_ALLOW_ENSURE_SCHEMA?.trim().toLowerCase() === 'true';
}

export function isAuthOtpBypassDisabled(): boolean {
  return process.env.AUTH_OTP_BYPASS_DISABLED?.trim().toLowerCase() === 'true';
}
