import { ForbiddenException } from '@nestjs/common';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { GLOBAL_ROLES } from '../../common/auth/jwt-user.payload';
import { hasOperationalRoleInDepartment } from '../../common/auth/department-access.util';

export function assertInventoryDepartmentAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === GLOBAL_ROLES.ADMIN || user.global_role === GLOBAL_ROLES.AUDITOR) return;
  if (hasOperationalRoleInDepartment(user, departmentId)) return;
  throw new ForbiddenException('No tiene permiso para inventario en este departamento');
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
