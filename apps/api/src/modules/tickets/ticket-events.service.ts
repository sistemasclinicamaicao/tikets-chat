import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Cliente interactivo de `$transaction` (mismos delegados que PrismaClient). */
export type PrismaTransaction = Omit<
  PrismaService,
  | '$connect'
  | '$disconnect'
  | '$on'
  | '$transaction'
  | '$extends'
  | '$use'
  | 'onModuleInit'
  | 'onModuleDestroy'
>;

export enum TicketEventType {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  COMMENTED = 'COMMENTED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
  SLA_BREACHED = 'SLA_BREACHED',
  ESCALATED = 'ESCALATED',
}

@Injectable()
export class TicketEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    params: {
      ticketId: string;
      eventType: TicketEventType;
      actorUserId?: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      notes?: string;
    },
    db: PrismaTransaction | PrismaService = this.prisma,
  ): Promise<void> {
    await db.ticketEvent.create({
      data: {
        ticketId: params.ticketId,
        eventType: params.eventType,
        actorUserId: params.actorUserId,
        oldValueJson: (params.oldValue ?? {}) as Prisma.InputJsonValue,
        newValueJson: (params.newValue ?? {}) as Prisma.InputJsonValue,
        notes: params.notes,
      },
    });
  }
}
