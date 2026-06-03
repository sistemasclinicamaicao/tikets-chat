import type { UserPayload } from './jwt-user.payload';

/** Usuario administrador global creado con `prisma/ensure-root-user.ts`. */
export const DEFAULT_ROOT_EMPLOYEE_ID = '910204052230';

export function isRootUser(user: Pick<UserPayload, 'employee_id'> | null | undefined): boolean {
  const employeeId = user?.employee_id?.trim() ?? '';
  if (!employeeId) return false;
  const configured = (process.env.ROOT_EMPLOYEE_IDS ?? DEFAULT_ROOT_EMPLOYEE_ID)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(employeeId);
}
