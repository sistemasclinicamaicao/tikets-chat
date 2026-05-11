import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registro de mantenimiento correctivo al cerrar ticket con activo asociado.
   */
  async createFromTicket(ticketId: string, closedBy: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        assetId: true,
        closureSummary: true,
        closedAt: true,
      },
    });
    if (!ticket?.assetId) {
      throw new NotFoundException('Ticket has no asset');
    }
    const performedAt = ticket.closedAt ?? new Date();
    const summary = ticket.closureSummary ?? 'Cierre de ticket';
    await this.prisma.assetLifecycleEntry.create({
      data: {
        assetId: ticket.assetId,
        sourceType: 'ticket',
        sourceId: ticket.id,
        entryType: 'corrective',
        summary,
        performedBy: closedBy,
        performedAt,
      },
    });
  }
}
