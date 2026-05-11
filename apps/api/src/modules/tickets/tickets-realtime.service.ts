import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class TicketsRealtimeService {
  constructor(
    private readonly gateway: ChatGateway,
    private readonly prisma: PrismaService,
  ) {}

  /** Emite a sala de departamento y a observadores globales (admin/auditor). */
  emitToDepartment(departmentId: string, event: string, data: unknown): void {
    this.gateway.emitToRoom(`dept:${departmentId}`, event, data);
    this.gateway.emitToRoom('dept:all', event, data);
  }

  /**
   * Emite en la sala del canal de chat del ticket si existe (mismo id que room Socket.IO del chat).
   */
  async emitToTicketChannel(ticketId: string, event: string, data: unknown): Promise<void> {
    const ch = await this.prisma.chatChannel.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    if (ch) {
      this.gateway.emitToRoom(ch.id, event, data);
    }
  }
}
