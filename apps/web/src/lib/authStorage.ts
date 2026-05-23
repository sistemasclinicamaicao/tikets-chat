/**
 * Sesión de autenticación en el navegador:
 * - Escritorio (puntero fino, no APK, no navegador móvil típico): tokens y datos en `sessionStorage`
 *   ⇒ cerrar la pestaña equivale a cerrar sesión; seguir navegando o F5 mantienen la sesión en esa pestaña.
 * - Móvil navegador y Capacitor: `localStorage` ⇒ la sesión sobrevive al cerrar la pestaña o la app hasta
 *   «Cerrar sesión» explícito o hasta el máximo horario de sesión (12 h).
 */

const MOBILE_UA_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export type AuthStoredKey =
  | 'access_token'
  | 'refresh_token'
  | 'session_started_at'
  | 'user_name'
  | 'user_id'
  | 'user_employee_id'
  | 'user_email'
  | 'user_global_role'
  | 'user_department_roles'
  | 'session_device_name';

export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const SESSION_KEYS: AuthStoredKey[] = [
  'access_token',
  'refresh_token',
  'session_started_at',
  'user_name',
  'user_id',
  'user_employee_id',
  'user_email',
  'user_global_role',
  'user_department_roles',
  'session_device_name',
];

let legacyMigratePassDone = false;

export function isCapacitorNativeApp(): boolean {
  try {
    const c = typeof window !== 'undefined' ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor : undefined;
    return typeof c?.isNativePlatform === 'function' && c.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/** Escritorio con ratón/trackpad típico: sesión ligada a la pestaña (`sessionStorage`). */
export function useDesktopTabScopedAuth(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCapacitorNativeApp()) return false;
  if (MOBILE_UA_RE.test(navigator.userAgent ?? '')) return false;
  try {
    return window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

function primaryStorage(): Storage {
  return useDesktopTabScopedAuth() ? sessionStorage : localStorage;
}

/**
 * Migra sesión antigua sólo-almacenada-en-localStorage a esta pestaña (solo escritorio).
 */
export function migrateLegacyDesktopAuthOnce(): void {
  if (legacyMigratePassDone || typeof window === 'undefined') return;
  legacyMigratePassDone = true;
  if (!useDesktopTabScopedAuth()) return;
  if (sessionStorage.getItem('access_token')) return;
  const at = localStorage.getItem('access_token');
  if (!at) return;
  for (const k of SESSION_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) sessionStorage.setItem(k, v);
    localStorage.removeItem(k);
  }
}

export function authGet(key: AuthStoredKey): string | null {
  migrateLegacyDesktopAuthOnce();
  return primaryStorage().getItem(key);
}

export function authSet(key: AuthStoredKey, value: string): void {
  migrateLegacyDesktopAuthOnce();
  primaryStorage().setItem(key, value);
  if (useDesktopTabScopedAuth()) {
    localStorage.removeItem(key);
  }
}

export function authRemove(key: AuthStoredKey): void {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

/** Borra todas las claves de sesión en ambos storages (logout, expiración, etc.). */
export function clearAllAuthData(): void {
  for (const k of SESSION_KEYS) {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  }
  legacyMigratePassDone = false;
}

export function wipeAuthSessionFully(): void {
  clearAllAuthData();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
}

/** True si existe access token después de migación. */
export function hasStoredAccessToken(): boolean {
  migrateLegacyDesktopAuthOnce();
  return Boolean(primaryStorage().getItem('access_token'));
}

/** Al iniciar login correcto (o equivalente tras verify-otp). */
export function persistNewLoginSession(tokens: {
  access_token: string;
  refresh_token: string;
  device_name?: string | null;
  user: {
    id: string;
    name: string;
    employee_id: string;
    email?: string | null;
  };
}): void {
  clearAllAuthData();
  migrateLegacyDesktopAuthOnce();
  authSet('access_token', tokens.access_token);
  authSet('refresh_token', tokens.refresh_token);
  authSet('user_id', tokens.user.id);
  authSet('user_name', tokens.user.name);
  authSet('user_employee_id', tokens.user.employee_id);
  if (tokens.user.email != null && tokens.user.email !== '') {
    authSet('user_email', tokens.user.email);
  } else {
    authRemove('user_email');
  }
  authSet('session_started_at', String(Date.now()));
  const deviceName = tokens.device_name?.trim();
  if (deviceName) {
    authSet('session_device_name', deviceName);
  } else {
    authRemove('session_device_name');
  }
}

/** Marca tiempo de sesión cuando ya hay JWT pero falta marca (retrocompatibilidad). */
export function ensureSessionWallClockStarted(): void {
  migrateLegacyDesktopAuthOnce();
  const store = primaryStorage();
  if (!store.getItem('access_token')) return;
  if (!store.getItem('session_started_at')) {
    store.setItem('session_started_at', String(Date.now()));
    if (useDesktopTabScopedAuth()) localStorage.removeItem('session_started_at');
  }
}

/**
 * Cierra sesión si superan SESSION_MAX_MS desde session_started_at.
 */
export function clearSessionWallClockExceeded(): boolean {
  migrateLegacyDesktopAuthOnce();
  const store = primaryStorage();
  const at = store.getItem('access_token');
  if (!at) return false;
  let raw = store.getItem('session_started_at');
  if (!raw || !Number.isFinite(Number(raw))) {
    raw = String(Date.now());
    store.setItem('session_started_at', raw);
    if (useDesktopTabScopedAuth()) localStorage.removeItem('session_started_at');
    return false;
  }
  const t = Number(raw);
  if (Date.now() - t <= SESSION_MAX_MS) return false;
  wipeAuthSessionFully();
  return true;
}
