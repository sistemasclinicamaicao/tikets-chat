import { ForbiddenException } from '@nestjs/common';
import { DEPARTMENT_ROLES, GLOBAL_ROLES, type UserPayload } from './jwt-user.payload';

export { DEPARTMENT_ROLES, GLOBAL_ROLES };

export const ASSIGNABLE_DEPARTMENT_ROLES = [
  DEPARTMENT_ROLES.DEPT_ADMIN,
  DEPARTMENT_ROLES.SUPERVISOR,
  DEPARTMENT_ROLES.TECNICO_AREA,
] as const;

export type AssignableDepartmentRole = (typeof ASSIGNABLE_DEPARTMENT_ROLES)[number];

export const SUPERVISOR_LIKE_DEPARTMENT_ROLES = [
  DEPARTMENT_ROLES.SUPERVISOR,
  DEPARTMENT_ROLES.DEPT_ADMIN,
] as const;

export const OPERATIONAL_DEPARTMENT_ROLES = [
  DEPARTMENT_ROLES.DEPT_ADMIN,
  DEPARTMENT_ROLES.SUPERVISOR,
  DEPARTMENT_ROLES.TECNICO_AREA,
] as const;

export function isAssignableDepartmentRole(role: string): role is AssignableDepartmentRole {
  return (ASSIGNABLE_DEPARTMENT_ROLES as readonly string[]).includes(role);
}

export function isSupervisorLikeRole(role: string): boolean {
  return (SUPERVISOR_LIKE_DEPARTMENT_ROLES as readonly string[]).includes(role);
}

export function isOperationalDepartmentRole(role: string): boolean {
  return (OPERATIONAL_DEPARTMENT_ROLES as readonly string[]).includes(role);
}

export function hasDepartmentRole(
  user: UserPayload,
  departmentId: string,
  ...roles: string[]
): boolean {
  const allowed = new Set(roles);
  return (user.department_roles ?? []).some(
    (r) => r.departmentId === departmentId && allowed.has(r.role),
  );
}

export function isGlobalAdmin(user: UserPayload): boolean {
  return user.global_role === GLOBAL_ROLES.ADMIN;
}

export function canManageDepartmentUsers(user: UserPayload, departmentId: string): boolean {
  if (isGlobalAdmin(user)) return true;
  return hasDepartmentRole(user, departmentId, DEPARTMENT_ROLES.DEPT_ADMIN);
}

export function assertDepartmentUserManagement(user: UserPayload, departmentId: string): void {
  if (canManageDepartmentUsers(user, departmentId)) return;
  throw new ForbiddenException('No tiene permiso para gestionar usuarios en este departamento');
}

export function hasSupervisorLikeInDepartments(
  user: UserPayload,
  departmentIds?: string[],
): boolean {
  const dept = user.department_roles ?? [];
  return dept.some(
    (r) =>
      isSupervisorLikeRole(r.role) &&
      (departmentIds == null || departmentIds.length === 0 || departmentIds.includes(r.departmentId)),
  );
}

export function hasOperationalRoleInDepartment(user: UserPayload, departmentId: string): boolean {
  return (user.department_roles ?? []).some(
    (r) => r.departmentId === departmentId && isOperationalDepartmentRole(r.role),
  );
}

export function resolveDepartmentActorRole(user: UserPayload, departmentId: string): string {
  if (isGlobalAdmin(user)) return 'admin';
  const inDept = (user.department_roles ?? []).filter((d) => d.departmentId === departmentId);
  if (inDept.some((d) => isSupervisorLikeRole(d.role))) return 'supervisor';
  if (inDept.some((d) => d.role === DEPARTMENT_ROLES.TECNICO_AREA)) return 'tecnico_area';
  return 'solicitante';
}
