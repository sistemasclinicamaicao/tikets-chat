import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const TEMPLATE = {
  ticketCreated: 'ticket_created',
  ticketAssigned: 'ticket_assigned',
  ticketStatusChanged: 'ticket_status_changed',
  ticketClosed: 'ticket_closed',
} as const;

function formatTicketNumberDisplay(n: bigint): string {
  return `TK-${n.toString().padStart(6, '0')}`;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function appBaseUrl(): string {
  return (process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
}

function ticketLink(ticketId: string): string {
  const base = appBaseUrl();
  return base ? `${base}/tickets/${ticketId}` : '';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyTicketCreated(ticketId: string, departmentId: string): Promise<void> {
    try {
      const roleRows = await this.prisma.userDepartmentRole.findMany({
        where: {
          departmentId,
          role: { in: ['supervisor', 'tecnico_area'] },
        },
        select: { userId: true },
      });
      const recipientIds = [...new Set(roleRows.map((r) => r.userId))];
      const ticket = await this.loadTicketForEmail(ticketId);
      if (!ticket) return;

      const vars = this.ticketVars(ticket);
      const fallback = {
        subject: 'Nuevo ticket {{ticketNumber}} — {{departmentName}}',
        body:
          'Se creó el ticket {{ticketNumber}} en {{departmentName}}.\n\nAsunto: {{ticketSubject}}\n\n{{ticketLinkLine}}',
      };
      const { subject, body, templateId } = await this.resolveRendering(
        TEMPLATE.ticketCreated,
        fallback,
        vars,
      );

      for (const userId of recipientIds) {
        await this.deliverEmailNotification({
          userId,
          templateId,
          subject,
          bodyPlain: body,
        });
      }
    } catch (e) {
      this.logger.warn(`notifyTicketCreated failed ticket=${ticketId}: ${String(e)}`);
    }
  }

  async notifyTicketAssigned(ticketId: string, assigneeUserId: string): Promise<void> {
    try {
      const ticket = await this.loadTicketForEmail(ticketId);
      if (!ticket) return;

      const vars = this.ticketVars(ticket);
      const fallback = {
        subject: 'Ticket {{ticketNumber}} asignado a usted',
        body:
          'Le fue asignado el ticket {{ticketNumber}}.\n\nAsunto: {{ticketSubject}}\n\n{{ticketLinkLine}}',
      };
      const { subject, body, templateId } = await this.resolveRendering(
        TEMPLATE.ticketAssigned,
        fallback,
        vars,
      );

      await this.deliverEmailNotification({
        userId: assigneeUserId,
        templateId,
        subject,
        bodyPlain: body,
      });
    } catch (e) {
      this.logger.warn(`notifyTicketAssigned failed ticket=${ticketId}: ${String(e)}`);
    }
  }

  async notifyStatusChanged(ticketId: string, fromCode: string, toCode: string): Promise<void> {
    try {
      const ticket = await this.loadTicketForEmail(ticketId);
      if (!ticket) return;

      const recipientIds = this.ticketStakeholderUserIds(ticket);
      const vars = {
        ...this.ticketVars(ticket),
        fromStatus: fromCode,
        toStatus: toCode,
      };
      const fallback = {
        subject: 'Ticket {{ticketNumber}}: estado {{fromStatus}} → {{toStatus}}',
        body:
          'El ticket {{ticketNumber}} cambió de estado.\n\nDe: {{fromStatus}}\nA: {{toStatus}}\n\nAsunto: {{ticketSubject}}\n\n{{ticketLinkLine}}',
      };
      const { subject, body, templateId } = await this.resolveRendering(
        TEMPLATE.ticketStatusChanged,
        fallback,
        vars,
      );

      for (const userId of recipientIds) {
        await this.deliverEmailNotification({
          userId,
          templateId,
          subject,
          bodyPlain: body,
        });
      }
    } catch (e) {
      this.logger.warn(`notifyStatusChanged failed ticket=${ticketId}: ${String(e)}`);
    }
  }

  async notifyTicketClosed(ticketId: string): Promise<void> {
    try {
      const ticket = await this.loadTicketForEmail(ticketId);
      if (!ticket) return;

      const recipientIds = this.ticketStakeholderUserIds(ticket);
      const vars = this.ticketVars(ticket);
      const fallback = {
        subject: 'Ticket {{ticketNumber}} cerrado',
        body:
          'El ticket {{ticketNumber}} fue cerrado.\n\nAsunto: {{ticketSubject}}\n\n{{ticketLinkLine}}',
      };
      const { subject, body, templateId } = await this.resolveRendering(
        TEMPLATE.ticketClosed,
        fallback,
        vars,
      );

      for (const userId of recipientIds) {
        await this.deliverEmailNotification({
          userId,
          templateId,
          subject,
          bodyPlain: body,
        });
      }
    } catch (e) {
      this.logger.warn(`notifyTicketClosed failed ticket=${ticketId}: ${String(e)}`);
    }
  }

  private ticketLinkLine(ticketId: string): string {
    const link = ticketLink(ticketId);
    return link ? `Ver ticket: ${link}` : '';
  }

  private ticketVars(ticket: {
    id: string;
    ticketNumber: bigint;
    subject: string;
    department: { name: string };
  }): Record<string, string> {
    return {
      ticketNumber: formatTicketNumberDisplay(ticket.ticketNumber),
      ticketSubject: ticket.subject,
      departmentName: ticket.department.name,
      ticketLinkLine: this.ticketLinkLine(ticket.id),
    };
  }

  private ticketStakeholderUserIds(ticket: {
    requesterId: string;
    assignedTo: string | null;
    supervisorId: string | null;
  }): string[] {
    return [
      ...new Set(
        [ticket.requesterId, ticket.assignedTo, ticket.supervisorId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
  }

  private async loadTicketForEmail(ticketId: string) {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        requesterId: true,
        assignedTo: true,
        supervisorId: true,
        department: { select: { name: true } },
      },
    });
  }

  private async resolveRendering(
    templateName: string,
    fallback: { subject: string; body: string },
    vars: Record<string, string>,
  ): Promise<{ subject: string; body: string; templateId: string | null }> {
    const row = await this.prisma.notificationTemplate.findFirst({
      where: { name: templateName, isActive: true },
    });
    const subjectTpl = row?.subject?.trim() ? row.subject : fallback.subject;
    const bodyTpl = row?.bodyTemplate?.trim() ? row.bodyTemplate : fallback.body;
    return {
      subject: interpolate(subjectTpl ?? fallback.subject, vars),
      body: interpolate(bodyTpl ?? fallback.body, vars),
      templateId: row?.id ?? null,
    };
  }

  private async deliverEmailNotification(params: {
    userId: string;
    templateId: string | null;
    subject: string;
    bodyPlain: string;
  }): Promise<void> {
    /** Regla de producto: el correo solo se usa para OTP, nunca para tickets/chat. */
    await this.prisma.notificationLog.create({
      data: {
        userId: params.userId,
        notificationTemplateId: params.templateId,
        channel: 'email',
        recipient: params.userId,
        subject: params.subject,
        body: params.bodyPlain,
        status: 'skipped',
        errorMessage: 'EMAIL_ONLY_FOR_OTP',
      },
    });
    return;
  }
}
