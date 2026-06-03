/** Usuario administrador global (`prisma/ensure-root-user.ts`). */
export const ROOT_EMPLOYEE_ID = '910204052230';

export function isRootUser(profile: { employee_id?: string } | null | undefined): boolean {
  return profile?.employee_id?.trim() === ROOT_EMPLOYEE_ID;
}
