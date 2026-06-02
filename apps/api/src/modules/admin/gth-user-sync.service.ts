import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeGthDocumentId } from './admin-gth-row.util';
import { buildGthUserSyncPatch, type GthUserSyncPatch } from './admin-gth-user-sync.util';

export type GthIncomingRow = {
  externalRowKey: string;
  documentId: string | null;
  payload: Prisma.InputJsonValue;
};

const USER_SYNC_BATCH_SIZE = 50;

export type GthUsersSyncResult = {
  updated: number;
  created: number;
  skipped: number;
};

type UserForLogin = {
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  isActive: boolean;
};

@Injectable()
export class GthUserSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /** Propaga filas GTH a la tabla `users` (origen del login OTP). */
  async syncFromIncoming(incoming: GthIncomingRow[]): Promise<GthUsersSyncResult> {
    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < incoming.length; i += USER_SYNC_BATCH_SIZE) {
      const batch = incoming.slice(i, i + USER_SYNC_BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          const payload = row.payload as Record<string, unknown>;
          const patch = buildGthUserSyncPatch(payload);
          if (!patch) {
            skipped += 1;
            return;
          }
          const result = await this.applyPatch(patch);
          if (result === 'created') created += 1;
          else if (result === 'updated') updated += 1;
          else skipped += 1;
        }),
      );
    }

    return { updated, created, skipped };
  }

  /** Reconcilia `users` desde todo el directorio GTH ya guardado en BD. */
  async syncFromDirectory(): Promise<GthUsersSyncResult> {
    const rows = await this.prisma.gthDirectory.findMany({
      select: { externalRowKey: true, documentId: true, payload: true },
    });
    const incoming: GthIncomingRow[] = rows.map((row) => ({
      externalRowKey: row.externalRowKey,
      documentId: row.documentId,
      payload: row.payload as GthIncomingRow['payload'],
    }));
    return this.syncFromIncoming(incoming);
  }

  /**
   * Resuelve usuario para login OTP: tabla `users` primero; si no existe, alta desde `gth_directory`.
   */
  async resolveUserForLogin(employeeId: string): Promise<UserForLogin> {
    const trimmed = employeeId.trim();
    if (!trimmed) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    let user = await this.findUserByEmployeeId(trimmed);
    if (!user) {
      await this.provisionFromDirectory(trimmed);
      user = await this.findUserByEmployeeId(trimmed);
    }
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    if (!user.isActive) {
      throw new ForbiddenException('USER_INACTIVE');
    }
    return user;
  }

  private async findUserByEmployeeId(employeeId: string): Promise<UserForLogin | null> {
    const trimmed = employeeId.trim();
    const normalized = normalizeGthDocumentId(trimmed);
    const candidates = Array.from(new Set([trimmed, normalized].filter(Boolean)));

    for (const id of candidates) {
      const row = await this.prisma.user.findUnique({
        where: { employeeId: id },
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          isActive: true,
        },
      });
      if (row) return row;
    }
    return null;
  }

  private async provisionFromDirectory(employeeId: string): Promise<void> {
    const trimmed = employeeId.trim();
    const normalized = normalizeGthDocumentId(trimmed);
    const candidates = Array.from(new Set([trimmed, normalized].filter(Boolean)));

    const directory = await this.prisma.gthDirectory.findFirst({
      where: {
        OR: candidates.flatMap((candidate) => [
          { documentId: candidate },
          { documentId: { equals: candidate, mode: 'insensitive' } },
        ]),
      },
      orderBy: [{ lastSeenAt: 'desc' }, { syncedAt: 'desc' }],
      select: { payload: true },
    });

    if (!directory?.payload || typeof directory.payload !== 'object') return;

    const patch = buildGthUserSyncPatch(directory.payload as Record<string, unknown>);
    if (!patch) return;

    await this.applyPatch(patch);
  }

  private async applyPatch(patch: GthUserSyncPatch): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.prisma.user.findUnique({
      where: { employeeId: patch.employeeId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.user.update({
        where: { employeeId: patch.employeeId },
        data: {
          name: patch.name,
          isActive: patch.isActive,
          ...(patch.email ? { email: patch.email } : {}),
          ...(patch.phone ? { phone: patch.phone } : {}),
          ...(patch.jobTitle ? { jobTitle: patch.jobTitle } : {}),
          ...(patch.dependencyName ? { dependencyName: patch.dependencyName } : {}),
          ...(patch.laborType ? { laborType: patch.laborType } : {}),
        },
      });
      return 'updated';
    }

    await this.prisma.user.create({
      data: {
        employeeId: patch.employeeId,
        name: patch.name,
        email: patch.email,
        phone: patch.phone,
        jobTitle: patch.jobTitle,
        dependencyName: patch.dependencyName,
        laborType: patch.laborType,
        isActive: patch.isActive,
      },
    });
    return 'created';
  }
}
