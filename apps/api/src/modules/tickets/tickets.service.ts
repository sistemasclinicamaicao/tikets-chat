import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SlaService } from '../sla/sla.service';
import { StorageService } from '../storage/storage.service';
import { AddCommentDto, CommentTypeEnum } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { CreateTicketDto, TicketChannelEnum } from './dto/create-ticket.dto';
import { TicketFiltersDto, TicketSortByEnum, SortOrderEnum } from './dto/ticket-filters.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketEventType, TicketEventsService } from './ticket-events.service';
import { TicketFormService } from './ticket-form.service';
import { assertAssetSerialMatchesDepartmentRule } from './asset-inventory-code.util';
import { TicketWorkflowsService } from './ticket-workflows.service';
import { TicketsRealtimeService } from './tickets-realtime.service';

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketEvents: TicketEventsService,
    private readonly ticketForm: TicketFormService,
    private readonly ticketWorkflows: TicketWorkflowsService,
    private readonly sla: SlaService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: LifecycleService,
    private readonly storage: StorageService,
    private readonly chat: ChatService,
    private readonly realtime: TicketsRealtimeService,
  ) {}

  formatTicketNumberDisplay(n: bigint): string {
    return `TK-${n.toString().padStart(6, '0')}`;
  }

  private userDisplay(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    name: string;
  }) {
    if (user.firstName || user.lastName) {
      return {
        id: user.id,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
      };
    }
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { id: user.id, firstName: 'Usuario', lastName: '' };
    if (parts.length === 1) return { id: user.id, firstName: parts[0], lastName: '' };
    return { id: user.id, firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  private buildAccessWhere(user: UserPayload): Prisma.TicketWhereInput {
    if (user.global_role === 'admin' || user.global_role === 'auditor') {
      return {};
    }
    const dept = user.department_roles ?? [];
    const deptIds = [...new Set(dept.map((d) => d.departmentId))];
    const isSupervisor = dept.some((d) => d.role === 'supervisor');
    const isTecnico = dept.some((d) => d.role === 'tecnico_area');
    if (isSupervisor || isTecnico) {
      if (isTecnico) {
        return {
          OR: [{ assignedTo: user.sub }, { departmentId: { in: deptIds } }],
        };
      }
      return { departmentId: { in: deptIds } };
    }
    return { requesterId: user.sub };
  }

  private resolveActorRole(user: UserPayload, departmentId: string): string {
    if (user.global_role === 'admin') return 'admin';
    const inDept = (user.department_roles ?? []).filter((d) => d.departmentId === departmentId);
    if (inDept.some((d) => d.role === 'supervisor')) return 'supervisor';
    if (inDept.some((d) => d.role === 'tecnico_area')) return 'tecnico_area';
    return 'solicitante';
  }

  private async assertTicketVisible(ticketId: string, user: UserPayload) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, ...this.buildAccessWhere(user) },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
  }

  private assertNotClosed(isClosed: boolean) {
    if (isClosed) throw new ConflictException('El ticket ya está cerrado');
  }

  private assertNotAuditor(user: UserPayload) {
    if (user.global_role === 'auditor') {
      throw new ForbiddenException('El rol auditor es solo lectura');
    }
  }

  async findAll(filters: TicketFiltersDto, user: UserPayload): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const sortBy = filters.sortBy ?? TicketSortByEnum.createdAt;
    const sortOrder = filters.sortOrder ?? SortOrderEnum.desc;

    const access = this.buildAccessWhere(user);
    const where: Prisma.TicketWhereInput = {
      AND: [
        access,
        filters.statusCode
          ? { status: { code: filters.statusCode } }
          : {},
        filters.priorityCode
          ? { priority: { code: filters.priorityCode } }
          : {},
        filters.departmentId ? { departmentId: filters.departmentId } : {},
        filters.assignedTo ? { assignedTo: filters.assignedTo } : {},
        filters.requesterId ? { requesterId: filters.requesterId } : {},
        filters.assetId ? { assetId: filters.assetId } : {},
        filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {},
        filters.search
          ? {
              OR: [
                { subject: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const orderBy: Prisma.TicketOrderByWithRelationInput =
      sortBy === TicketSortByEnum.priorityId
        ? { priorityId: sortOrder }
        : { [sortBy]: sortOrder };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          status: { select: { id: true, code: true, name: true } },
          priority: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, name: true } },
          requester: { select: { id: true, firstName: true, lastName: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true, name: true } },
          asset: { select: { id: true, name: true, serialNumber: true } },
        },
      }),
    ]);

    const data = rows.map((t) => ({
      ...t,
      ticketNumberFormatted: this.formatTicketNumberDisplay(t.ticketNumber),
      ticketNumber: t.ticketNumber.toString(),
      requester: this.userDisplay(t.requester),
      assignee: t.assignee ? this.userDisplay(t.assignee) : null,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, user: UserPayload) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.buildAccessWhere(user) },
      include: {
        status: { select: { id: true, code: true, name: true } },
        priority: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        requester: { select: { id: true, firstName: true, lastName: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, name: true } },
        asset: { select: { id: true, name: true, serialNumber: true, qrCode: true } },
        events: {
          orderBy: { createdAt: 'asc' },
          include: {
            actor: { select: { id: true, firstName: true, lastName: true, name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, firstName: true, lastName: true, name: true } } },
        },
        formValues: {
          include: {
            templateField: {
              select: { fieldKey: true, fieldLabel: true, fieldType: true },
            },
          },
        },
        attachments: { include: { attachment: true } },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const hideInternal =
      user.sub === ticket.requesterId &&
      user.global_role !== 'admin' &&
      user.global_role !== 'auditor' &&
      !(user.department_roles ?? []).length;

    const comments = hideInternal
      ? ticket.comments.filter((c) => c.commentType === 'public')
      : ticket.comments;

    const attachments = await Promise.all(
      ticket.attachments.map(async (ta) => ({
        ...ta,
        url: await this.storage.getAttachmentUrl(ta.attachmentId),
      })),
    );

    return {
      ...ticket,
      ticketNumberFormatted: this.formatTicketNumberDisplay(ticket.ticketNumber),
      ticketNumber: ticket.ticketNumber.toString(),
      requester: this.userDisplay(ticket.requester),
      assignee: ticket.assignee ? this.userDisplay(ticket.assignee) : null,
      events: ticket.events.map((e) => ({
        ...e,
        actor: e.actor ? this.userDisplay(e.actor) : null,
      })),
      comments: comments.map((c) => ({
        ...c,
        user: this.userDisplay(c.user),
      })),
      attachments,
      formValues: ticket.formValues.map((fv) => ({
        ...fv,
        field: fv.templateField,
      })),
    };
  }

  async getTimeline(id: string, user: UserPayload) {
    await this.assertTicketVisible(id, user);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { departmentId: true, requesterId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const [events, comments] = await Promise.all([
      this.prisma.ticketEvent.findMany({
        where: { ticketId: id },
        include: { actor: { select: { id: true, firstName: true, lastName: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketComment.findMany({
        where: { ticketId: id },
        include: { user: { select: { id: true, firstName: true, lastName: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const hideInternal =
      user.sub === ticket.requesterId &&
      user.global_role !== 'admin' &&
      user.global_role !== 'auditor' &&
      !(user.department_roles ?? []).length;
    const filteredComments = hideInternal
      ? comments.filter((c) => c.commentType === 'public')
      : comments;

    const timeline: Array<Record<string, unknown>> = [];
    for (const e of events) {
      timeline.push({
        type: 'event',
        id: e.id,
        createdAt: e.createdAt,
        actor: e.actor ? this.userDisplay(e.actor) : null,
        eventType: e.eventType,
        oldValue: e.oldValueJson,
        newValue: e.newValueJson,
        notes: e.notes,
      });
    }
    for (const c of filteredComments) {
      timeline.push({
        type: 'comment',
        id: c.id,
        createdAt: c.createdAt,
        actor: this.userDisplay(c.user),
        content: c.content,
        commentType: c.commentType,
      });
    }
    timeline.sort((a, b) => new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime());
    return timeline;
  }

  async create(dto: CreateTicketDto, user: UserPayload) {
    this.assertNotAuditor(user);
    const dept = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, isActive: true },
    });
    if (!dept) throw new NotFoundException('Departamento no encontrado');

    let priorityId = dto.priorityId;
    if (!priorityId) {
      const defaultPr =
        (await this.prisma.ticketPriority.findFirst({ where: { code: 'media' } })) ??
        (await this.prisma.ticketPriority.findFirst({ orderBy: { name: 'asc' } }));
      if (!defaultPr) throw new NotFoundException('Prioridades de ticket no configuradas');
      priorityId = defaultPr.id;
    }

    const subject = dto.subject?.trim() || `Solicitud — ${dept.name}`;

    let templateId: string | null = dto.templateId ?? null;
    if (templateId) {
      const tpl = await this.prisma.template.findFirst({
        where: {
          id: templateId,
          departmentId: dto.departmentId,
          isActive: true,
          usageType: 'ticket_create',
        },
      });
      if (!tpl) throw new BadRequestException('Plantilla no válida para este departamento');
    } else {
      const tpl = await this.prisma.template.findFirst({
        where: {
          departmentId: dto.departmentId,
          isActive: true,
          usageType: 'ticket_create',
        },
        orderBy: { name: 'asc' },
      });
      templateId = tpl?.id ?? null;
    }

    const defaultStatus = await this.prisma.ticketStatus.findFirst({
      where: { isDefault: true },
    });
    if (!defaultStatus) throw new NotFoundException('Estados de ticket no configurados');

    const slaDueAt = await this.sla.calculateDueAt(dto.departmentId, priorityId);

    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.assetId, departmentId: dto.departmentId },
      });
      if (!asset) throw new BadRequestException('El activo no pertenece al departamento');
      const deptRule = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { assetInventoryCodePattern: true, assetInventoryCodeExample: true },
      });
      assertAssetSerialMatchesDepartmentRule(asset, deptRule ?? {});
    }

    const supervisorRow = await this.prisma.userDepartmentRole.findFirst({
      where: { departmentId: dto.departmentId, role: 'supervisor' },
      select: { userId: true },
    });
    const supervisorId = supervisorRow?.userId ?? null;

    const channel = dto.channel ?? TicketChannelEnum.web;

    const created = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          departmentId: dto.departmentId,
          templateId,
          requesterId: user.sub,
          supervisorId,
          assetId: dto.assetId,
          statusId: defaultStatus.id,
          priorityId,
          subject,
          description: dto.description,
          channel,
          slaDueAt,
        },
      });

      if (templateId) {
        await this.ticketForm.validateAndSave(
          {
            ticketId: ticket.id,
            templateId,
            formValues: dto.formValues ?? [],
          },
          tx,
        );
      }

      await this.ticketEvents.record(
        {
          ticketId: ticket.id,
          eventType: TicketEventType.CREATED,
          actorUserId: user.sub,
          newValue: { subject, departmentId: dto.departmentId },
        },
        tx,
      );

      return ticket;
    });

    await this.chat.provisionTicketChannel({
      ticketId: created.id,
      departmentId: dto.departmentId,
      requesterId: user.sub,
      supervisorId,
      ticketNumber: created.ticketNumber,
    });

    await this.notifications.notifyTicketCreated(created.id, dto.departmentId);
    const createdPayload = {
      ticketId: created.id,
      ticketNumber: this.formatTicketNumberDisplay(created.ticketNumber),
    };
    this.realtime.emitToDepartment(dto.departmentId, 'ticket:created', createdPayload);
    await this.realtime.emitToTicketChannel(created.id, 'ticket:created', createdPayload);

    return this.findOne(created.id, user);
  }

  async update(id: string, dto: UpdateTicketDto, user: UserPayload) {
    this.assertNotAuditor(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.buildAccessWhere(user) },
      include: { status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    this.assertNotClosed(ticket.status.isClosed);

    const role = this.resolveActorRole(user, ticket.departmentId);
    const isAdminOrSup = user.global_role === 'admin' || role === 'supervisor';

    if (dto.subject !== undefined || dto.description !== undefined) {
      if (ticket.assignedTo && user.sub === ticket.requesterId && !isAdminOrSup) {
        throw new ForbiddenException('No puede editar asunto o descripción tras asignación');
      }
      if (user.sub !== ticket.requesterId && !isAdminOrSup) {
        throw new ForbiddenException('Sin permiso para editar este ticket');
      }
    }

    if (dto.priorityId !== undefined || dto.assetId !== undefined) {
      if (!isAdminOrSup && user.global_role !== 'auditor') {
        throw new ForbiddenException('Solo admin o supervisor pueden cambiar prioridad o activo');
      }
    }

    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.assetId, departmentId: ticket.departmentId },
      });
      if (!asset) throw new BadRequestException('El activo no pertenece al departamento');
      const deptRule = await this.prisma.department.findUnique({
        where: { id: ticket.departmentId },
        select: { assetInventoryCodePattern: true, assetInventoryCodeExample: true },
      });
      assertAssetSerialMatchesDepartmentRule(asset, deptRule ?? {});
    }

    let slaDueAt = ticket.slaDueAt;
    if (dto.priorityId && dto.priorityId !== ticket.priorityId) {
      slaDueAt = await this.sla.calculateDueAt(ticket.departmentId, dto.priorityId);
      await this.ticketEvents.record({
        ticketId: id,
        eventType: TicketEventType.PRIORITY_CHANGED,
        actorUserId: user.sub,
        oldValue: { priorityId: ticket.priorityId },
        newValue: { priorityId: dto.priorityId },
      });
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        subject: dto.subject,
        description: dto.description,
        priorityId: dto.priorityId,
        assetId: dto.assetId,
        slaDueAt,
      },
      include: {
        status: true,
        priority: true,
        department: true,
        requester: true,
        assignee: true,
        asset: true,
      },
    });

    return {
      ...updated,
      ticketNumberFormatted: this.formatTicketNumberDisplay(updated.ticketNumber),
      ticketNumber: updated.ticketNumber.toString(),
    };
  }

  async assign(id: string, dto: AssignTicketDto, user: UserPayload) {
    this.assertNotAuditor(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.buildAccessWhere(user) },
      include: { status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    this.assertNotClosed(ticket.status.isClosed);

    if (
      user.global_role !== 'admin' &&
      this.resolveActorRole(user, ticket.departmentId) !== 'supervisor'
    ) {
      throw new ForbiddenException('Solo administrador o supervisor del área pueden asignar');
    }

    const assigneeRole = await this.prisma.userDepartmentRole.findUnique({
      where: {
        userId_departmentId: { userId: dto.assignedTo, departmentId: ticket.departmentId },
      },
    });
    if (!assigneeRole || assigneeRole.role !== 'tecnico_area') {
      throw new BadRequestException('El usuario a asignar debe ser técnico del departamento');
    }

    const assignedStatus = await this.prisma.ticketStatus.findFirst({
      where: { code: 'asignado' },
    });

    let nextStatusId = ticket.statusId;
    if (
      assignedStatus &&
      (ticket.status.code === 'abierto' || ticket.status.code === 'triaje')
    ) {
      nextStatusId = assignedStatus.id;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: {
          assignedTo: dto.assignedTo,
          assignedAt: new Date(),
          statusId: nextStatusId,
        },
        include: { status: true },
      });

      await tx.ticketAssignment.create({
        data: {
          ticketId: id,
          assignedTo: dto.assignedTo,
          assignedBy: user.sub,
          notes: dto.notes,
        },
      });

      await this.ticketEvents.record(
        {
          ticketId: id,
          eventType: TicketEventType.ASSIGNED,
          actorUserId: user.sub,
          newValue: { assignedTo: dto.assignedTo },
          notes: dto.notes,
        },
        tx,
      );

      return t;
    });

    await this.notifications.notifyTicketAssigned(id, dto.assignedTo);
    await this.chat.addUsersToTicketChannel(id, [dto.assignedTo]);

    return this.findOne(updated.id, user);
  }

  async changeStatus(id: string, dto: ChangeStatusDto, user: UserPayload) {
    this.assertNotAuditor(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.buildAccessWhere(user) },
      include: { status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    this.assertNotClosed(ticket.status.isClosed);

    const actorRole = this.resolveActorRole(user, ticket.departmentId);
    if (actorRole === 'tecnico_area' && ticket.assignedTo !== user.sub) {
      throw new ForbiddenException('Solo puede cambiar estado de tickets asignados a usted');
    }

    const toStatus = await this.prisma.ticketStatus.findFirst({
      where: { code: dto.toStatusCode },
    });
    if (!toStatus) throw new NotFoundException('Estado destino no encontrado');

    const hasResolution = Boolean(ticket.resolvedAt) || toStatus.code === 'resuelto';
    await this.ticketWorkflows.validateTransition({
      departmentId: ticket.departmentId,
      fromStatusId: ticket.statusId,
      toStatusId: toStatus.id,
      hasComment: Boolean(dto.comment?.trim()),
      hasResolution,
      checklistDone: Boolean(dto.checklistDone),
      actorRole,
    });

    const firstResponseAt =
      !toStatus.isClosed && ticket.firstResponseAt == null ? new Date() : ticket.firstResponseAt;
    const resolvedAt = toStatus.code === 'resuelto' ? new Date() : ticket.resolvedAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id },
        data: {
          statusId: toStatus.id,
          firstResponseAt,
          resolvedAt,
        },
      });

      if (dto.comment?.trim()) {
        await tx.ticketComment.create({
          data: {
            ticketId: id,
            userId: user.sub,
            commentType: 'internal',
            content: dto.comment.trim(),
          },
        });
      }

      await this.ticketEvents.record(
        {
          ticketId: id,
          eventType: TicketEventType.STATUS_CHANGED,
          actorUserId: user.sub,
          oldValue: { statusCode: ticket.status.code },
          newValue: { statusCode: toStatus.code },
        },
        tx,
      );
    });

    await this.notifications.notifyStatusChanged(id, ticket.status.code, toStatus.code);
    this.realtime.emitToDepartment(ticket.departmentId, 'ticket:status_changed', {
      ticketId: id,
      to: toStatus.code,
    });
    await this.realtime.emitToTicketChannel(id, 'ticket:status_changed', {
      ticketId: id,
      to: toStatus.code,
    });

    return this.findOne(id, user);
  }

  async close(id: string, dto: CloseTicketDto, user: UserPayload) {
    this.assertNotAuditor(user);
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.buildAccessWhere(user) },
      include: { status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    this.assertNotClosed(ticket.status.isClosed);

    const actorRole = this.resolveActorRole(user, ticket.departmentId);
    if (user.global_role !== 'admin') {
      if (actorRole !== 'supervisor' && actorRole !== 'tecnico_area') {
        throw new ForbiddenException('Sin permiso para cerrar este ticket');
      }
    }
    if (actorRole === 'tecnico_area' && ticket.assignedTo !== user.sub) {
      throw new ForbiddenException('Solo puede cerrar tickets asignados a usted');
    }

    const closedStatus = await this.prisma.ticketStatus.findFirst({
      where: { code: 'cerrado' },
    });
    if (!closedStatus) throw new NotFoundException('Estado cerrado no configurado');

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id },
        data: {
          closureSummary: dto.closureSummary,
          closedAt: new Date(),
          resolvedAt: ticket.resolvedAt ?? new Date(),
          statusId: closedStatus.id,
        },
      });

      if (dto.comment?.trim()) {
        await tx.ticketComment.create({
          data: {
            ticketId: id,
            userId: user.sub,
            commentType: 'public',
            content: dto.comment.trim(),
          },
        });
      }

      await this.ticketEvents.record(
        {
          ticketId: id,
          eventType: TicketEventType.CLOSED,
          actorUserId: user.sub,
          notes: dto.closureSummary,
        },
        tx,
      );
    });

    if (ticket.assetId) {
      await this.lifecycle.createFromTicket(id, user.sub);
    }

    await this.notifications.notifyTicketClosed(id);
    this.realtime.emitToDepartment(ticket.departmentId, 'ticket:closed', { ticketId: id });
    await this.realtime.emitToTicketChannel(id, 'ticket:closed', { ticketId: id });

    return this.findOne(id, user);
  }

  async addComment(id: string, dto: AddCommentDto, user: UserPayload) {
    this.assertNotAuditor(user);
    await this.assertTicketVisible(id, user);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { departmentId: true, status: { select: { isClosed: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    this.assertNotClosed(ticket.status.isClosed);

    const type = dto.commentType ?? CommentTypeEnum.public;
    if (type === CommentTypeEnum.internal) {
      const r = this.resolveActorRole(user, ticket.departmentId);
      if (user.global_role !== 'admin' && r !== 'supervisor' && r !== 'tecnico_area') {
        throw new ForbiddenException('Sin permiso para comentario interno');
      }
    }

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId: id,
        userId: user.sub,
        commentType: type,
        content: dto.content,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, name: true } } },
    });

    await this.ticketEvents.record({
      ticketId: id,
      eventType: TicketEventType.COMMENTED,
      actorUserId: user.sub,
      newValue: { commentType: type },
    });

    await this.realtime.emitToTicketChannel(id, 'ticket:comment', {
      ticketId: id,
      commentId: comment.id,
    });

    return { ...comment, user: this.userDisplay(comment.user) };
  }

  async getStatuses() {
    return this.prisma.ticketStatus.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async getPriorities() {
    return this.prisma.ticketPriority.findMany({ orderBy: { code: 'asc' } });
  }

  async getDepartments() {
    const rows = await this.prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        assetInventoryCodeExample: true,
        assetInventoryCodePattern: true,
        templates: {
          where: { isActive: true, usageType: 'ticket_create' },
          orderBy: { name: 'asc' },
          take: 1,
          select: { id: true, name: true },
        },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      assetInventoryCodeExample: d.assetInventoryCodeExample,
      assetInventoryCodePattern: d.assetInventoryCodePattern,
      createTicketTemplate: d.templates[0] ?? null,
    }));
  }

  /** Compat: listado legado solo solicitante. */
  async getMyTickets(userId: string) {
    const rows = await this.prisma.ticket.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        status: true,
        priority: true,
        department: true,
      },
    });
    return rows.map((t) => {
      const { ticketNumber, ...rest } = t;
      return {
        ...rest,
        ticketNumber: ticketNumber.toString(),
        ticketNumberFormatted: this.formatTicketNumberDisplay(ticketNumber),
      };
    });
  }
}
