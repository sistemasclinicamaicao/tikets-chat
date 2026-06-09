import { ForbiddenException } from '@nestjs/common';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { GLOBAL_ROLES } from '../../common/auth/jwt-user.payload';
import { hasOperationalRoleInDepartment } from '../../common/auth/department-access.util';

export function assertInventoryDepartmentAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === GLOBAL_ROLES.ADMIN || user.global_role === GLOBAL_ROLES.AUDITOR) return;
  if (user.global_role === GLOBAL_ROLES.USUARIO_GENERAL) {
    const allowed = (user.department_roles ?? []).some((d) => d.departmentId === departmentId);
    if (allowed) return;
    throw new ForbiddenException('No tiene permiso para este departamento');
  }
  if (hasOperationalRoleInDepartment(user, departmentId)) return;
  throw new ForbiddenException('No tiene permiso para inventario en este departamento');
}

/** Sincronizar directorio GTH: admin, usuario_general del departamento u operativo de área (no auditor). */
export function assertGthDirectorySyncAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === GLOBAL_ROLES.AUDITOR) {
    throw new ForbiddenException('El rol auditor es solo lectura');
  }
  if (user.global_role === GLOBAL_ROLES.ADMIN) return;
  if (user.global_role === GLOBAL_ROLES.USUARIO_GENERAL) {
    const inDept = (user.department_roles ?? []).some((d) => d.departmentId === departmentId);
    if (inDept) return;
    throw new ForbiddenException('No tiene permiso para sincronizar GTH en este departamento');
  }
  if (hasOperationalRoleInDepartment(user, departmentId)) return;
  throw new ForbiddenException('No tiene permiso para sincronizar GTH en este departamento');
}

/** Alta, edición, baja lógica y foto: admin o técnico/supervisor/admin de área (no auditor). */
export function assertInventoryWriteAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === GLOBAL_ROLES.AUDITOR) {
    throw new ForbiddenException('El rol auditor es solo lectura');
  }
  if (user.global_role === GLOBAL_ROLES.ADMIN) return;
  if (hasOperationalRoleInDepartment(user, departmentId)) return;
  throw new ForbiddenException('No tiene permiso para modificar inventario en este departamento');
}
