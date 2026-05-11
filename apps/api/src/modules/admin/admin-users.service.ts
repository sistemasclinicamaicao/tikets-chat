import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SetUserDepartmentRolesDto } from './dto/set-user-department-roles.dto';
import { UpdateUserGlobalRoleDto } from './dto/update-user-global-role.dto';

const ALLOWED_GLOBAL = new Set(['admin', 'auditor']);

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async listUsers(skip = 0, take = 50) {
    const safeTake = Math.min(Math.max(take, 1), 200);
    const safeSkip = Math.max(skip, 0);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: safeSkip,
        take: safeTake,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          isActive: true,
          globalRole: true,
          departmentRoles: { select: { departmentId: true, role: true } },
        },
      }),
      this.prisma.user.count(),
    ]);
    return {
      items: rows.map((u) => ({
        id: u.id,
        employee_id: u.employeeId,
        name: u.name,
        email: u.email,
        is_active: u.isActive,
        global_role: u.globalRole,
        department_roles: u.departmentRoles.map((r) => ({
          department_id: r.departmentId,
          role: r.role,
        })),
      })),
      total,
      skip: safeSkip,
      take: safeTake,
    };
  }

  async updateGlobalRole(
    targetUserId: string,
    dto: UpdateUserGlobalRoleDto,
    actorUserId: string,
  ) {
    if (dto.global_role === undefined) {
      throw new BadRequestException('global_role required');
    }
    const next = dto.global_role === null ? null : dto.global_role;
    if (next != null && !ALLOWED_GLOBAL.has(next)) {
      throw new BadRequestException('Invalid global_role');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, globalRole: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.globalRole === 'admin' && next !== 'admin') {
      const adminCount = await this.prisma.user.count({ where: { globalRole: 'admin' } });
      if (adminCount <= 1) {
        throw new ConflictException('Cannot remove the last global administrator');
      }
    }

    if (targetUserId === actorUserId && target.globalRole === 'admin' && next !== 'admin') {
      const adminCount = await this.prisma.user.count({ where: { globalRole: 'admin' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('You cannot demote yourself as the only administrator');
      }
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { globalRole: next },
    });
    this.audit.record({
      action: 'settings.user_global_role',
      actorUserId,
      resource: targetUserId,
      meta: { global_role: next },
    });
    return { ok: true as const };
  }

  async setDepartmentRoles(
    targetUserId: string,
    dto: SetUserDepartmentRolesDto,
    actorUserId: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    const deptIds = [...new Set(dto.roles.map((r) => r.department_id))];
    const depts = await this.prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true },
    });
    if (depts.length !== deptIds.length) {
      throw new BadRequestException('Unknown department in roles');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userDepartmentRole.deleteMany({ where: { userId: targetUserId } });
      for (const r of dto.roles) {
        await tx.userDepartmentRole.create({
          data: {
            userId: targetUserId,
            departmentId: r.department_id,
            role: r.role,
          },
        });
      }
    });

    this.audit.record({
      action: 'settings.user_department_roles',
      actorUserId,
      resource: targetUserId,
      meta: { count: dto.roles.length },
    });
    return { ok: true as const };
  }
}
