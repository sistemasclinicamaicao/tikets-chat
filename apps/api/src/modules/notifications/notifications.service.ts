import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const TEMPLATE = {
  ticketCreated: 'ticket_created',
  ticketAssigned: 'ticket_assigned',
  ticketStatusChanged: 'ticket_status_changed',
  ticketClosed: 'ticket_closed',
  chatNewMessage: 'chat_new_message',
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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

  /**
   * Notifica por correo a miembros del canal (excluye al remitente). `recipientUserIds` debe calcularse en ChatService.
   */
  async notifyChatNewMessage(params: {
    channelId: string;
    messageId: string;
    senderUserId: string;
    senderName: string;
    preview: string;
    recipientUserIds: string[];
  }): Promise<void> {
    if ((process.env.NOTIFY_CHAT_EMAIL ?? 'true').trim().toLowerCase() === 'false') {
      return;
    }
    try {
      const ch = await this.prisma.chatChannel.findUnique({
        where: { id: params.channelId },
        select: {
          name: true,
          channelType: true,
          ticket: { select: { id: true, ticketNumber: true } },
        },
      });

      let channelLabel = ch?.name?.trim() || 'Chat';
      if (ch?.ticket) {
        channelLabel = `Ticket ${formatTicketNumberDisplay(ch.ticket.ticketNumber)}`;
      }

      const base = appBaseUrl();
      const ticketPath = ch?.ticket ? `/tickets/${ch.ticket.id}` : '';
      const chatLinkLine = base ? `Abrir: ${base}${ticketPath}` : '';

      const vars: Record<string, string> = {
        channelLabel,
        senderName: params.senderName,
        preview: params.preview,
        messageId: params.messageId,
        chatLinkLine,
      };

      const fallback = {
        subject: 'Nuevo mensaje en {{channelLabel}}',
        body:
          '{{senderName}} escribió:\n\n{{preview}}\n\nCanal: {{channelLabel}}\n\n{{chatLinkLine}}',
      };
      const { subject, body, templateId } = await this.resolveRendering(
        TEMPLATE.chatNewMessage,
        fallback,
        vars,
      );

      for (const userId of params.recipientUserIds) {
        if (userId === params.senderUserId) continue;
        await this.deliverEmailNotification({
          userId,
          templateId,
          subject,
          bodyPlain: body,
        });
      }
    } catch (e) {
      this.logger.warn(`notifyChatNewMessage failed channel=${params.channelId}: ${String(e)}`);
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
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true, isActive: true },
    });

    if (!user?.isActive) {
      await this.prisma.notificationLog.create({
        data: {
          userId: params.userId,
          notificationTemplateId: params.templateId,
          channel: 'email',
          recipient: params.userId,
          subject: params.subject,
          body: params.bodyPlain,
          status: 'skipped',
          errorMessage: 'USER_INACTIVE',
        },
      });
      return;
    }

    const email = user.email?.trim() ?? '';
    if (!email) {
      await this.prisma.notificationLog.create({
        data: {
          userId: params.userId,
          notificationTemplateId: params.templateId,
          channel: 'email',
          recipient: params.userId,
          subject: params.subject,
          body: params.bodyPlain,
          status: 'skipped',
          errorMessage: 'NO_EMAIL',
        },
      });
      return;
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: params.userId,
        notificationTemplateId: params.templateId,
        channel: 'email',
        recipient: email,
        subject: params.subject,
        body: params.bodyPlain,
        status: 'pending',
      },
    });

    const result = await this.mail.sendTransactionalMail({
      to: email,
      subject: params.subject,
      text: params.bodyPlain,
    });

    if (result.ok) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'sent', sentAt: new Date(), errorMessage: null },
      });
    } else {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'failed', errorMessage: result.code },
      });
    }
  }
}
