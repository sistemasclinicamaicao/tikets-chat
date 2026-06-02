import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GthPhotoSyncService } from '../gth/gth-photo-sync.service';
import { TicketsService } from '../tickets/tickets.service';
import type { GthIncomingRow } from './admin-gth-directory.service';
import { buildGthEmployeeSnapshot, formatGthOnboardingChatMessage } from './admin-gth-row.util';

const DEFAULT_COMUNICACIONES_NAME = 'COMUNICACIONES';

export type GthComunicacionesTicketCreateResult = {
  created: number;
  skipped: number;
  errors: string[];
};

@Injectable()
export class AdminGthComunicacionesTicketsService {
  private readonly logger = new Logger(AdminGthComunicacionesTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly gthPhotoSync: GthPhotoSyncService,
  ) {}

  private comunicacionesDepartmentName(): string {
    return (process.env.GTH_COMUNICACIONES_DEPARTMENT_NAME ?? DEFAULT_COMUNICACIONES_NAME).trim();
  }

  async resolveComunicacionesDepartmentId(): Promise<string | null> {
    const target = this.comunicacionesDepartmentName().toUpperCase();
    const dept = await this.prisma.department.findFirst({
      where: {
        isActive: true,
        name: { equals: target, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (dept) return dept.id;

    const fallback = await this.prisma.department.findFirst({
      where: {
        isActive: true,
        name: { contains: 'COMUNICACION', mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    if (!fallback) {
      this.logger.warn(
        `Departamento Comunicaciones no encontrado (GTH_COMUNICACIONES_DEPARTMENT_NAME="${this.comunicacionesDepartmentName()}").`,
      );
      return null;
    }
    return fallback.id;
  }

  async createTicketsForAdditions(
    added: GthIncomingRow[],
    actorUserId: string,
    syncRunId: string,
  ): Promise<GthComunicacionesTicketCreateResult> {
    if (added.length === 0) return { created: 0, skipped: 0, errors: [] };

    const departmentId = await this.resolveComunicacionesDepartmentId();
    if (!departmentId) {
      return {
        created: 0,
        skipped: added.length,
        errors: ['Departamento Comunicaciones no configurado'],
      };
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of added) {
      try {
        const payload = row.payload as Record<string, unknown>;
        const snapshot = buildGthEmployeeSnapshot(payload);
        const documentId = row.documentId ?? snapshot.documentId;
        const fullName = snapshot.fullName;
        const cargo = snapshot.cargo;
        const onboardingMessage = formatGthOnboardingChatMessage(payload);

        const existing = await this.prisma.gthComunicacionesTicket.findUnique({
          where: { externalRowKey: row.externalRowKey },
          select: { id: true, ticketId: true },
        });
        if (existing) {
          await this.tickets.ensureGthTicketChatBootstrap(
            existing.ticketId,
            actorUserId,
            onboardingMessage,
          );
          skipped += 1;
          continue;
        }

        const customDataJson: Prisma.InputJsonValue = {
          source: 'gth',
          externalRowKey: row.externalRowKey,
          documentId,
          documentType: snapshot.documentType || null,
          fullName,
          cargo,
          syncRunId,
        };

        const ticket = await this.tickets.createFromGthSync({
          departmentId,
          actorUserId,
          subject: `Alta GTH: ${fullName}`,
          description: onboardingMessage,
          customDataJson,
        });

        const addition = await this.prisma.gthSyncAddition.findUnique({
          where: {
            syncRunId_externalRowKey: {
              syncRunId,
              externalRowKey: row.externalRowKey,
            },
          },
          select: { id: true },
        });

        await this.prisma.gthComunicacionesTicket.create({
          data: {
            ticketId: ticket.id,
            externalRowKey: row.externalRowKey,
            documentId,
            fullName,
            cargo: cargo ?? '',
            gthSyncAdditionId: addition?.id ?? null,
            syncRunId,
          },
        });

        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${row.externalRowKey}: ${msg}`);
        this.logger.error(`GTH ticket create failed for ${row.externalRowKey}: ${msg}`);
      }
    }

    return { created, skipped, errors };
  }

  /** Rellena o actualiza la plantilla GTH en chat y descripción del ticket. */
  async backfillMissingGthChatMessages(actorUserId: string): Promise<{ filled: number; updated: number }> {
    const links = await this.prisma.gthComunicacionesTicket.findMany({
      select: {
        ticketId: true,
        externalRowKey: true,
        documentId: true,
        fullName: true,
        cargo: true,
        gthSyncAddition: { select: { payload: true } },
      },
    });

    let filled = 0;
    let updated = 0;
    for (const link of links) {
      let payload = link.gthSyncAddition?.payload as Record<string, unknown> | undefined;
      if (!payload) {
        const dir = await this.prisma.gthDirectory.findUnique({
          where: { externalRowKey: link.externalRowKey },
          select: { payload: true },
        });
        payload = (dir?.payload as Record<string, unknown> | undefined) ?? undefined;
      }
      if (!payload) {
        payload = {
          PRIMERNOMBRE: link.fullName,
          DOC: link.documentId ?? '',
          CARGO: link.cargo,
        };
      }

      const templateBody = formatGthOnboardingChatMessage(payload);
      const created = await this.tickets.ensureGthTicketChatBootstrap(
        link.ticketId,
        actorUserId,
        templateBody,
      );
      if (created) {
        filled += 1;
        continue;
      }
      const refreshed = await this.tickets.syncGthTicketChatTemplate(link.ticketId, templateBody);
      if (refreshed) updated += 1;
    }

    return { filled, updated };
  }

  /** Promueve la primera imagen del chat a gth_photo en tickets GTH que aún no la tienen. */
  async backfillGthPhotosFromChat(actorUserId: string): Promise<{ promoted: number; skipped: number }> {
    const links = await this.prisma.gthComunicacionesTicket.findMany({
      select: { ticketId: true },
    });

    let promoted = 0;
    let skipped = 0;

    for (const link of links) {
      const hasPhoto = await this.prisma.ticketAttachment.findFirst({
        where: {
          ticketId: link.ticketId,
          attachmentRole: 'gth_photo',
          attachment: { mimeType: { startsWith: 'image/' } },
        },
        select: { id: true },
      });
      if (hasPhoto) {
        const closed = await this.gthPhotoSync.autoCloseGthComunicacionesAfterPhoto(
          link.ticketId,
          actorUserId,
        );
        if (closed) promoted += 1;
        else skipped += 1;
        continue;
      }

      const ok = await this.gthPhotoSync.promoteFirstChatImageFromTicketChannel(
        link.ticketId,
        actorUserId,
      );
      if (ok) promoted += 1;
      else skipped += 1;
    }

    return { promoted, skipped };
  }

  async listOnboarding(departmentId: string, options?: { resolvedOnly?: boolean }) {
    const resolvedOnly = options?.resolvedOnly !== false;

    const rows = await this.prisma.gthComunicacionesTicket.findMany({
      where: {
        ticket: {
          departmentId,
          ...(resolvedOnly ? { status: { isClosed: true } } : {}),
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            status: { select: { id: true, code: true, name: true, isClosed: true } },
          },
        },
      },
    });

    const photoByTicket = new Map<string, { attachmentId: string; url: string }>();
    if (rows.length > 0) {
      const ticketIds = rows.map((r) => r.ticketId);
      const photos = await this.prisma.ticketAttachment.findMany({
        where: {
          ticketId: { in: ticketIds },
          attachmentRole: 'gth_photo',
          attachment: { mimeType: { startsWith: 'image/' } },
        },
        orderBy: { createdAt: 'asc' },
        include: { attachment: { select: { id: true, mimeType: true } } },
      });
      for (const p of photos) {
        if (photoByTicket.has(p.ticketId)) continue;
        const url = await this.tickets.getAttachmentSignedUrl(p.attachmentId);
        photoByTicket.set(p.ticketId, { attachmentId: p.attachmentId, url });
      }
    }

    return rows
      .map((row) => {
        const photo = photoByTicket.get(row.ticketId);
        return {
          id: row.id,
          external_row_key: row.externalRowKey,
          document_id: row.documentId,
          full_name: row.fullName,
          cargo: row.cargo,
          ticket_id: row.ticketId,
          ticket_number: row.ticket.ticketNumber.toString(),
          ticket_number_formatted: this.tickets.formatTicketNumberDisplay(row.ticket.ticketNumber),
          status: {
            code: row.ticket.status.code,
            name: row.ticket.status.name,
            is_closed: row.ticket.status.isClosed,
          },
          photo_attachment_id: photo?.attachmentId ?? null,
          photo_url: photo?.url ?? null,
          created_at: row.createdAt.toISOString(),
        };
      })
      .filter((row) => !resolvedOnly || row.photo_url);
  }
}
