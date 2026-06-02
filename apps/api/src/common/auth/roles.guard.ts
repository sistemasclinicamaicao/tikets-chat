import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import {
  DEPARTMENT_ROLES,
  isSupervisorLikeRole,
} from './department-access.util';
import type { UserPayload } from './jwt-user.payload';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user: UserPayload }>();
    const user = req.user;
    if (!user) return false;

    const isAdmin = user.global_role === 'admin';
    if (isAdmin) return true;

    const isAuditor = user.global_role === 'auditor';
    const dept = user.department_roles ?? [];
    const isSupervisor = dept.some((d) => isSupervisorLikeRole(d.role));
    const isTecnico = dept.some((d) => d.role === DEPARTMENT_ROLES.TECNICO_AREA);
    const isPlainRequester = !isAuditor && !isSupervisor && !isTecnico;

    return required.some((role) => {
      if (role === 'admin') return false;
      if (role === 'auditor') return isAuditor;
      if (role === 'supervisor') return isSupervisor;
      if (role === 'tecnico_area') return isTecnico || isSupervisor;
      if (role === 'solicitante') return isPlainRequester;
      return false;
    });
  }
}
