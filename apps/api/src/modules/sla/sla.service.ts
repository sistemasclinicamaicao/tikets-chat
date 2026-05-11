import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  /** SLA de resolución objetivo según prioridad (minutos). */
  async calculateDueAt(departmentId: string, priorityId: string): Promise<Date> {
    void departmentId;
    const p = await this.prisma.ticketPriority.findUnique({
      where: { id: priorityId },
      select: { resolutionMinutes: true, responseMinutes: true },
    });
    const minutes = p?.resolutionMinutes ?? p?.responseMinutes ?? 8 * 60;
    return new Date(Date.now() + Math.max(1, minutes) * 60_000);
  }
}
