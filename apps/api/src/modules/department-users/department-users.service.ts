import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import {
  ASSIGNABLE_DEPARTMENT_ROLES,
  assertDepartmentUserManagement,
  isAssignableDepartmentRole,
  isGlobalAdmin,
} from '../../common/auth/department-access.util';
import { DEPARTMENT_ROLES, type UserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { mapEmployeeIdsToDocumentDisplay } from '../admin/admin-gth-document-lookup.util';
import { UpsertDepartmentUserDto } from './dto/upsert-department-user.dto';

function mapMemberRow(
  row: {
    user: {
      id: string;
      employeeId: string;
      name: string;
      isActive: boolean;
    };
    role: string;
  },
  displayMap: Map<string, string>,
) {
  return {
    user_id: row.user.id,
    employee_id: row.user.employeeId,
    employee_document_display: displayMap.get(row.user.employeeId) ?? row.user.employeeId,
    name: row.user.name,
    is_active: row.user.isActive,
    role: row.role,
  };
}

@Injectable()
export class DepartmentUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private async assertDepartmentExists(departmentId: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, isActive: true },
    });
    if (!dept) throw new NotFoundException('Departamento no encontrado');
    return dept;
  }

  private async countDeptAdmins(departmentId: string): Promise<number> {
    return this.prisma.userDepartmentRole.count({
      where: { departmentId, role: DEPARTMENT_ROLES.DEPT_ADMIN },
    });
  }

  private async assertLastDeptAdminProtectedAsync(params: {
    actor: UserPayload;
    departmentId: string;
    targetUserId: string;
    currentRole: string | null;
    nextRole?: string | null;
    action: 'remove' | 'demote';
  }): Promise<void> {
    if (isGlobalAdmin(params.actor)) return;
    if (params.currentRole !== DEPARTMENT_ROLES.DEPT_ADMIN) return;
    const demoting =
      params.action === 'remove' ||
      (params.nextRole != null && params.nextRole !== DEPARTMENT_ROLES.DEPT_ADMIN);
    if (!demoting) return;

    const count = await this.countDeptAdmins(params.departmentId);
    if (count <= 1) {
      if (params.actor.sub === params.targetUserId) {
        throw new ForbiddenException(
          'No puede quitarse como último administrador del departamento',
        );
      }
      throw new ConflictException(
        'No se puede quitar o degradar al último administrador del departamento',
      );
    }
  }

  async listMembers(departmentId: string, actor: UserPayload) {
    await this.assertDepartmentExists(departmentId);
    assertDepartmentUserManagement(actor, departmentId);

    const rows = await this.prisma.userDepartmentRole.findMany({
      where: { departmentId },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      select: {
        role: true,
        user: {
          select: { id: true, employeeId: true, name: true, isActive: true },
        },
      },
    });

    const displayMap = await mapEmployeeIdsToDocumentDisplay(
      this.prisma,
      rows.map((r) => r.user.employeeId),
    );

    return {
      department_id: departmentId,
      items: rows.map((row) => mapMemberRow(row, displayMap)),
    };
  }

  async searchCandidates(departmentId: string, actor: UserPayload, q: string) {
    await this.assertDepartmentExists(departmentId);
    assertDepartmentUserManagement(actor, departmentId);

    const term = q.trim();
    if (term.length < 2) {
      throw new BadRequestException('La búsqueda requiere al menos 2 caracteres');
    }

    const existing = await this.prisma.userDepartmentRole.findMany({
      where: { departmentId },
      select: { userId: true, role: true },
    });
    const existingByUser = new Map(existing.map((r) => [r.userId, r.role]));

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { employeeId: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 25,
      select: { id: true, employeeId: true, name: true },
    });

    const displayMap = await mapEmployeeIdsToDocumentDisplay(
      this.prisma,
      users.map((u) => u.employeeId),
    );

    return {
      department_id: departmentId,
      items: users.map((u) => ({
        user_id: u.id,
        employee_id: u.employeeId,
        employee_document_display: displayMap.get(u.employeeId) ?? u.employeeId,
        name: u.name,
        in_department: existingByUser.has(u.id),
        current_role: existingByUser.get(u.id) ?? null,
      })),
    };
  }

  async upsertMember(
    departmentId: string,
    targetUserId: string,
    dto: UpsertDepartmentUserDto,
    actor: UserPayload,
  ) {
    await this.assertDepartmentExists(departmentId);
    assertDepartmentUserManagement(actor, departmentId);

    if (!isAssignableDepartmentRole(dto.role)) {
      throw new BadRequestException(
        `Rol inválido. Permitidos: ${ASSIGNABLE_DEPARTMENT_ROLES.join(', ')}`,
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (!target.isActive) {
      throw new BadRequestException('Solo se pueden asociar usuarios activos');
    }

    const existing = await this.prisma.userDepartmentRole.findUnique({
      where: { userId_departmentId: { userId: targetUserId, departmentId } },
      select: { role: true },
    });

    await this.assertLastDeptAdminProtectedAsync({
      actor,
      departmentId,
      targetUserId,
      currentRole: existing?.role ?? null,
      nextRole: dto.role,
      action: 'demote',
    });

    const row = await this.prisma.userDepartmentRole.upsert({
      where: { userId_departmentId: { userId: targetUserId, departmentId } },
      create: {
        userId: targetUserId,
        departmentId,
        role: dto.role,
      },
      update: { role: dto.role },
      select: {
        role: true,
        user: {
          select: { id: true, employeeId: true, name: true, isActive: true },
        },
      },
    });

    this.audit.record({
      action: 'department.user_membership.upsert',
      actorUserId: actor.sub,
      resource: `${departmentId}:${targetUserId}`,
      meta: { role: dto.role, previous_role: existing?.role ?? null },
    });

    const displayMap = await mapEmployeeIdsToDocumentDisplay(this.prisma, [row.user.employeeId]);

    return mapMemberRow(row, displayMap);
  }

  async removeMember(departmentId: string, targetUserId: string, actor: UserPayload) {
    await this.assertDepartmentExists(departmentId);
    assertDepartmentUserManagement(actor, departmentId);

    const existing = await this.prisma.userDepartmentRole.findUnique({
      where: { userId_departmentId: { userId: targetUserId, departmentId } },
      select: { role: true },
    });
    if (!existing) throw new NotFoundException('El usuario no pertenece a este departamento');

    await this.assertLastDeptAdminProtectedAsync({
      actor,
      departmentId,
      targetUserId,
      currentRole: existing.role,
      action: 'remove',
    });

    await this.prisma.userDepartmentRole.delete({
      where: { userId_departmentId: { userId: targetUserId, departmentId } },
    });

    this.audit.record({
      action: 'department.user_membership.remove',
      actorUserId: actor.sub,
      resource: `${departmentId}:${targetUserId}`,
      meta: { role: existing.role },
    });

    return { ok: true as const };
  }
}
