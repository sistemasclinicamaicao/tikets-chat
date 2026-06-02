import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { TicketEventType, TicketEventsService } from '../tickets/ticket-events.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class GthPhotoSyncService {
  private readonly logger = new Logger(GthPhotoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ticketEvents: TicketEventsService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  private async emitTicketAttachmentAdded(ticketId: string): Promise<void> {
    const ch = await this.prisma.chatChannel.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    if (ch) {
      this.chatGateway.emitToRoom(ch.id, 'ticket:attachment_added', { ticketId });
    }
  }

  private emitTicketClosed(ticketId: string, departmentId: string): void {
    this.chatGateway.emitToRoom(`dept:${departmentId}`, 'ticket:closed', { ticketId });
    this.chatGateway.emitToRoom('dept:all', 'ticket:closed', { ticketId });
    void this.prisma.chatChannel
      .findUnique({ where: { ticketId }, select: { id: true } })
      .then((ch) => {
        if (ch) this.chatGateway.emitToRoom(ch.id, 'ticket:closed', { ticketId });
      });
  }

  /** Cierra automáticamente tickets Alta GTH tras registrar gth_photo. Idempotente si ya está cerrado. */
  async autoCloseGthComunicacionesAfterPhoto(
    ticketId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const link = await this.prisma.gthComunicacionesTicket.findUnique({
      where: { ticketId },
      select: { fullName: true },
    });
    if (!link) return false;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { status: true },
    });
    if (!ticket || ticket.status.isClosed) return false;

    const photo = await this.prisma.ticketAttachment.findFirst({
      where: {
        ticketId,
        attachmentRole: 'gth_photo',
        attachment: { mimeType: { startsWith: 'image/' } },
      },
      select: { id: true },
    });
    if (!photo) return false;

    const closedStatus = await this.prisma.ticketStatus.findFirst({
      where: { code: 'cerrado' },
    });
    if (!closedStatus) {
      this.logger.warn(`GTH auto-close: estado cerrado no configurado (${ticketId})`);
      return false;
    }

    const closureSummary = `Alta GTH cerrada automáticamente: fotografía registrada para ${link.fullName}.`;

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          closureSummary,
          closedAt: new Date(),
          resolvedAt: ticket.resolvedAt ?? new Date(),
          statusId: closedStatus.id,
        },
      });
      await this.ticketEvents.record(
        {
          ticketId,
          eventType: TicketEventType.CLOSED,
          actorUserId,
          notes: closureSummary,
          newValue: { auto: true, trigger: 'gth_photo' },
        },
        tx,
      );
    });

    await this.notifications.notifyTicketClosed(ticketId);
    this.emitTicketClosed(ticketId, ticket.departmentId);
    return true;
  }

  async promoteChatImageToGthPhoto(
    ticketId: string,
    actorUserId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ): Promise<boolean> {
    if (!file.mimetype.startsWith('image/')) return false;

    const link = await this.prisma.gthComunicacionesTicket.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    if (!link) return false;

    const existing = await this.prisma.ticketAttachment.findFirst({
      where: {
        ticketId,
        attachmentRole: 'gth_photo',
        attachment: { mimeType: { startsWith: 'image/' } },
      },
      select: { id: true },
    });
    if (existing) {
      try {
        await this.autoCloseGthComunicacionesAfterPhoto(ticketId, actorUserId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`GTH auto-close (existing photo) failed for ${ticketId}: ${reason}`);
      }
      return false;
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { status: true },
    });
    if (!ticket || ticket.status.isClosed) return false;

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const storageKey = `tickets/${ticketId}/${Date.now()}-${randomUUID()}-${safeName}`;

    try {
      await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.logger.warn(`GTH photo promote failed for ${ticketId}: ${reason}`);
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          storageKey,
          originalName: file.originalname.slice(0, 255),
          mimeType: file.mimetype.slice(0, 127),
          sizeBytes: file.size,
        },
      });
      await tx.ticketAttachment.create({
        data: {
          ticketId,
          attachmentId: attachment.id,
          attachmentRole: 'gth_photo',
          createdBy: actorUserId,
        },
      });
      await this.ticketEvents.record(
        {
          ticketId,
          eventType: TicketEventType.ATTACHMENT_ADDED,
          actorUserId,
          newValue: { attachmentId: attachment.id, role: 'gth_photo', source: 'chat' },
        },
        tx,
      );
    });

    await this.emitTicketAttachmentAdded(ticketId);
    try {
      await this.autoCloseGthComunicacionesAfterPhoto(ticketId, actorUserId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GTH auto-close failed for ${ticketId}: ${reason}`);
    }
    return true;
  }

  async promoteFirstChatImageFromTicketChannel(
    ticketId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    if (!channel) return false;

    const chatPhoto = await this.prisma.chatAttachment.findFirst({
      where: {
        message: { channelId: channel.id },
        mimeType: { startsWith: 'image/' },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
      },
    });
    if (!chatPhoto) return false;

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObjectBuffer(chatPhoto.storageKey);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GTH photo backfill: could not read chat blob for ${ticketId}: ${reason}`);
      return false;
    }

    return this.promoteChatImageToGthPhoto(ticketId, actorUserId, {
      buffer,
      originalname: chatPhoto.originalName,
      mimetype: chatPhoto.mimeType,
      size: chatPhoto.sizeBytes,
    });
  }
}
