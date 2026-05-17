/** Cuentas usadas recientemente en este dispositivo (persiste tras cerrar sesión). */
export type RememberedLoginAccount = {
  employeeId: string;
  name: string;
  lastUsedAt: number;
};

const STORAGE_KEY = 'chat_tickets_remembered_logins';
const MAX_ACCOUNTS = 6;

export function loadRememberedLoginAccounts(): RememberedLoginAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is RememberedLoginAccount =>
          row != null &&
          typeof row === 'object' &&
          typeof (row as RememberedLoginAccount).employeeId === 'string' &&
          typeof (row as RememberedLoginAccount).name === 'string' &&
          typeof (row as RememberedLoginAccount).lastUsedAt === 'number',
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

export function upsertRememberedLoginAccount(employeeId: string, name: string): void {
  if (typeof window === 'undefined') return;
  const id = employeeId.trim();
  const displayName = name.trim();
  if (!id || !displayName) return;

  const list = loadRememberedLoginAccounts().filter((a) => a.employeeId !== id);
  list.unshift({ employeeId: id, name: displayName, lastUsedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
}
