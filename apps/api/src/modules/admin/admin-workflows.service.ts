import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { CreateWorkflowTransitionDto } from './dto/create-workflow-transition.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { UpdateWorkflowTransitionDto } from './dto/update-workflow-transition.dto';

@Injectable()
export class AdminWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  listWorkflows() {
    return this.prisma.workflowDefinition.findMany({
      orderBy: { name: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        transitions: {
          include: {
            fromStatus: { select: { id: true, code: true, name: true } },
            toStatus: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
  }

  async createWorkflow(dto: CreateWorkflowDto, actorUserId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: dto.department_id } });
    if (!dept) throw new NotFoundException('Departamento no encontrado');
    const row = await this.prisma.workflowDefinition.create({
      data: {
        departmentId: dto.department_id,
        name: dto.name.trim(),
        isActive: dto.is_active ?? true,
      },
      include: { department: { select: { id: true, name: true } } },
    });
    this.audit.record({
      action: 'settings.workflow_created',
      actorUserId,
      resource: row.id,
      meta: { name: row.name },
    });
    return row;
  }

  async updateWorkflow(id: string, dto: UpdateWorkflowDto, actorUserId: string) {
    const existing = await this.prisma.workflowDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Flujo no encontrado');
    const row = await this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.is_active != null ? { isActive: dto.is_active } : {}),
      },
    });
    this.audit.record({
      action: 'settings.workflow_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async createTransition(workflowId: string, dto: CreateWorkflowTransitionDto, actorUserId: string) {
    const wf = await this.prisma.workflowDefinition.findUnique({ where: { id: workflowId } });
    if (!wf) throw new NotFoundException('Flujo no encontrado');
    if (dto.from_status_id === dto.to_status_id) {
      throw new BadRequestException('Los estados origen y destino deben ser distintos');
    }
    const [fromS, toS] = await Promise.all([
      this.prisma.ticketStatus.findUnique({ where: { id: dto.from_status_id } }),
      this.prisma.ticketStatus.findUnique({ where: { id: dto.to_status_id } }),
    ]);
    if (!fromS || !toS) throw new NotFoundException('Estado no encontrado');
    try {
      const row = await this.prisma.workflowTransition.create({
        data: {
          workflowId,
          fromStatusId: dto.from_status_id,
          toStatusId: dto.to_status_id,
          requiresComment: dto.requires_comment ?? false,
          requiresResolution: dto.requires_resolution ?? false,
          requiresChecklist: dto.requires_checklist ?? false,
          requiresSupervisorApproval: dto.requires_supervisor_approval ?? false,
        },
        include: {
          fromStatus: { select: { id: true, code: true, name: true } },
          toStatus: { select: { id: true, code: true, name: true } },
        },
      });
      this.audit.record({
        action: 'settings.workflow_transition_created',
        actorUserId,
        resource: row.id,
        meta: { workflowId },
      });
      return row;
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Ya existe esta transición para el flujo');
      }
      throw e;
    }
  }

  async updateTransition(id: string, dto: UpdateWorkflowTransitionDto, actorUserId: string) {
    const existing = await this.prisma.workflowTransition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Transición no encontrada');
    const fromId = dto.from_status_id ?? existing.fromStatusId;
    const toId = dto.to_status_id ?? existing.toStatusId;
    if (fromId === toId) throw new BadRequestException('Los estados origen y destino deben ser distintos');
    const row = await this.prisma.workflowTransition.update({
      where: { id },
      data: {
        ...(dto.from_status_id != null ? { fromStatusId: dto.from_status_id } : {}),
        ...(dto.to_status_id != null ? { toStatusId: dto.to_status_id } : {}),
        ...(dto.requires_comment != null ? { requiresComment: dto.requires_comment } : {}),
        ...(dto.requires_resolution != null ? { requiresResolution: dto.requires_resolution } : {}),
        ...(dto.requires_checklist != null ? { requiresChecklist: dto.requires_checklist } : {}),
        ...(dto.requires_supervisor_approval != null
          ? { requiresSupervisorApproval: dto.requires_supervisor_approval }
          : {}),
      },
      include: {
        fromStatus: { select: { id: true, code: true, name: true } },
        toStatus: { select: { id: true, code: true, name: true } },
      },
    });
    this.audit.record({
      action: 'settings.workflow_transition_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async deleteTransition(id: string, actorUserId: string) {
    const existing = await this.prisma.workflowTransition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Transición no encontrada');
    await this.prisma.workflowTransition.delete({ where: { id } });
    this.audit.record({
      action: 'settings.workflow_transition_deleted',
      actorUserId,
      resource: id,
    });
    return { ok: true as const };
  }
}
