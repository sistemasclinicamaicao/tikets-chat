import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateTicketPriorityDto } from './dto/create-ticket-priority.dto';
import { CreateTicketStatusDto } from './dto/create-ticket-status.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

function normalizeTicketStatusCategory(input: string | undefined): string {
  const t = input?.trim();
  if (!t || t === 'active') return 'activo';
  return t;
}

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  listDepartments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async createDepartment(dto: CreateDepartmentDto, actorUserId: string) {
    const now = new Date();
    const row = await this.prisma.department.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        assetInventoryCodeExample: dto.asset_inventory_code_example?.trim() || null,
        assetInventoryCodePattern: dto.asset_inventory_code_pattern?.trim() || null,
        isActive: dto.is_active ?? true,
        createdAt: now,
        updatedAt: now,
      },
    });
    this.audit.record({
      action: 'settings.department_created',
      actorUserId,
      resource: row.id,
      meta: { name: row.name },
    });
    return row;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actorUserId: string) {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Departamento no encontrado');
    const row = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.is_active != null ? { isActive: dto.is_active } : {}),
        ...(dto.asset_inventory_code_example !== undefined
          ? {
              assetInventoryCodeExample: dto.asset_inventory_code_example?.trim() || null,
            }
          : {}),
        ...(dto.asset_inventory_code_pattern !== undefined
          ? {
              assetInventoryCodePattern: dto.asset_inventory_code_pattern?.trim() || null,
            }
          : {}),
      },
    });
    this.audit.record({
      action: 'settings.department_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  listTicketStatuses() {
    return this.prisma.ticketStatus.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
  }

  async createTicketStatus(dto: CreateTicketStatusDto, actorUserId: string) {
    const category = dto.category?.trim() || 'active';
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default) {
        await tx.ticketStatus.updateMany({
          where: { category, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.ticketStatus.create({
        data: {
          code: dto.code.trim().toLowerCase(),
          name: dto.name.trim(),
          category,
          isClosed: dto.is_closed ?? false,
          isDefault: dto.is_default ?? false,
          sortOrder: dto.sort_order ?? 0,
        },
      });
    });
    this.audit.record({
      action: 'settings.ticket_status_created',
      actorUserId,
      resource: row.id,
      meta: { code: row.code },
    });
    return row;
  }

  async updateTicketStatus(id: string, dto: UpdateTicketStatusDto, actorUserId: string) {
    const existing = await this.prisma.ticketStatus.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Estado no encontrado');
    const category =
      dto.category != null
        ? normalizeTicketStatusCategory(dto.category)
        : normalizeTicketStatusCategory(existing.category);
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.is_default === true) {
        await tx.ticketStatus.updateMany({
          where: { category, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.ticketStatus.update({
        where: { id },
        data: {
          ...(dto.code != null ? { code: dto.code.trim().toLowerCase() } : {}),
          ...(dto.name != null ? { name: dto.name.trim() } : {}),
          ...(dto.category != null
            ? { category: normalizeTicketStatusCategory(dto.category) }
            : {}),
          ...(dto.is_closed != null ? { isClosed: dto.is_closed } : {}),
          ...(dto.is_default != null ? { isDefault: dto.is_default } : {}),
          ...(dto.sort_order != null ? { sortOrder: dto.sort_order } : {}),
        },
      });
    });
    this.audit.record({
      action: 'settings.ticket_status_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async deleteTicketStatus(id: string, actorUserId: string) {
    const n = await this.prisma.ticket.count({ where: { statusId: id } });
    if (n > 0) {
      throw new ConflictException(
        'El estado está en uso por tickets; actualícelo en lugar de eliminarlo',
      );
    }
    const wf = await this.prisma.workflowTransition.count({
      where: { OR: [{ fromStatusId: id }, { toStatusId: id }] },
    });
    if (wf > 0) {
      throw new ConflictException('El estado está referenciado por transiciones de flujo');
    }
    await this.prisma.ticketStatus.delete({ where: { id } });
    this.audit.record({
      action: 'settings.ticket_status_deleted',
      actorUserId,
      resource: id,
    });
    return { ok: true as const };
  }

  listTicketPriorities() {
    return this.prisma.ticketPriority.findMany({ orderBy: { name: 'asc' } });
  }

  async createTicketPriority(dto: CreateTicketPriorityDto, actorUserId: string) {
    const row = await this.prisma.ticketPriority.create({
      data: {
        code: dto.code.trim().toLowerCase(),
        name: dto.name.trim(),
        responseMinutes: dto.response_minutes ?? null,
        resolutionMinutes: dto.resolution_minutes ?? null,
      },
    });
    this.audit.record({
      action: 'settings.ticket_priority_created',
      actorUserId,
      resource: row.id,
      meta: { code: row.code },
    });
    return row;
  }

  async updateTicketPriority(id: string, dto: UpdateTicketPriorityDto, actorUserId: string) {
    const existing = await this.prisma.ticketPriority.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prioridad no encontrada');
    const row = await this.prisma.ticketPriority.update({
      where: { id },
      data: {
        ...(dto.code != null ? { code: dto.code.trim().toLowerCase() } : {}),
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.response_minutes !== undefined ? { responseMinutes: dto.response_minutes } : {}),
        ...(dto.resolution_minutes !== undefined ? { resolutionMinutes: dto.resolution_minutes } : {}),
      },
    });
    this.audit.record({
      action: 'settings.ticket_priority_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async deleteTicketPriority(id: string, actorUserId: string) {
    const n = await this.prisma.ticket.count({ where: { priorityId: id } });
    if (n > 0) {
      throw new ConflictException('La prioridad está en uso por tickets');
    }
    await this.prisma.ticketPriority.delete({ where: { id } });
    this.audit.record({
      action: 'settings.ticket_priority_deleted',
      actorUserId,
      resource: id,
    });
    return { ok: true as const };
  }
}
