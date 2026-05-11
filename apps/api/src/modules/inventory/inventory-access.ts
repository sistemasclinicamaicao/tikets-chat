import { ForbiddenException } from '@nestjs/common';
import type { UserPayload } from '../../common/auth/jwt-user.payload';

export function assertInventoryDepartmentAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === 'admin' || user.global_role === 'auditor') return;
  const roles = user.department_roles ?? [];
  const inDept = roles.filter((r) => r.departmentId === departmentId);
  const ok = inDept.some((r) => r.role === 'supervisor' || r.role === 'tecnico_area');
  if (!ok) {
    throw new ForbiddenException('No tiene permiso para inventario en este departamento');
  }
}

/** Alta, edición, baja lógica y foto: admin o técnico/supervisor del área (no auditor). */
export function assertInventoryWriteAccess(user: UserPayload, departmentId: string): void {
  if (user.global_role === 'auditor') {
    throw new ForbiddenException('El rol auditor es solo lectura');
  }
  if (user.global_role === 'admin') return;
  const roles = user.department_roles ?? [];
  const inDept = roles.filter((r) => r.departmentId === departmentId);
  const ok = inDept.some((r) => r.role === 'supervisor' || r.role === 'tecnico_area');
  if (!ok) {
    throw new ForbiddenException('No tiene permiso para modificar inventario en este departamento');
  }
}
