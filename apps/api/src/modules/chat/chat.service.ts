import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ChatService {
  private readonly onlineCounts = new Map<string, number>();
  private membershipTableReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  setUserOnline(userId: string) {
    this.onlineCounts.set(userId, (this.onlineCounts.get(userId) ?? 0) + 1);
  }

  setUserOffline(userId: string) {
    const next = (this.onlineCounts.get(userId) ?? 0) - 1;
    if (next <= 0) this.onlineCounts.delete(userId);
    else this.onlineCounts.set(userId, next);
  }

  getOnlineUserIds() {
    return Array.from(this.onlineCounts.keys());
  }

  getPresence() {
    return this.getOnlineUserIds();
  }

  /** Ids en línea restringidos a usuarios que comparten al menos un canal con `userId`. */
  async getPresenceForUser(userId: string) {
    const online = new Set(this.getOnlineUserIds());
    if (online.size === 0) return [];
    const peers = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT m.user_id
      FROM chat_channel_members m
      INNER JOIN chat_channel_members me
        ON me.channel_id = m.channel_id AND me.user_id = ${userId}
      WHERE m.user_id <> ${userId}
        AND me.hidden_from_ui_at IS NULL
    `;
    const peerSet = new Set(peers.map((p) => p.user_id));
    return [...online].filter((id) => peerSet.has(id));
  }

  /** Ruta de `apps/api/.env` (válida con código en `src/` o `dist/`). */
  private getApiDotEnvPath(): string {
    return path.join(__dirname, '..', '..', '..', '.env');
  }

  /**
   * Límite de filas en `GET /chat/users`. Por defecto 100000; techo 500000.
   * Solo se usa `CHAT_DIRECTORY_USER_LIMIT` si está definida en `apps/api/.env`.
   * Así se evita que una variable homónima en el entorno del sistema (p. ej. `200`) reduzca el listado sin estar en el proyecto.
   */
  private resolveChatDirectoryUserLimit(): {
    limit: number;
    keyFromApiFile: boolean;
    rawFromFile: string | undefined;
  } {
    const envPath = this.getApiDotEnvPath();
    let raw: string | undefined;
    let keyFromApiFile = false;
    try {
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        if (Object.prototype.hasOwnProperty.call(parsed, 'CHAT_DIRECTORY_USER_LIMIT')) {
          keyFromApiFile = true;
          raw = parsed.CHAT_DIRECTORY_USER_LIMIT;
        }
      }
    } catch {
      /* ignore */
    }
    if (!keyFromApiFile) {
      return { limit: Math.min(500_000, 100_000), keyFromApiFile: false, rawFromFile: undefined };
    }
    return {
      limit: Math.min(Math.max(1, Number(raw) || 100_000), 500_000),
      keyFromApiFile: true,
      rawFromFile: raw,
    };
  }

  async listUsers(currentUserId: string) {
    const dirLimit = this.resolveChatDirectoryUserLimit();
    return this.prisma.user.findMany({
      where: { isActive: true, id: { not: currentUserId } },
      select: { id: true, employeeId: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: dirLimit.limit,
    });
  }

  private async ensureMembershipTable() {
    if (this.membershipTableReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS chat_channel_members (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_read_at TIMESTAMPTZ NULL
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_channel_members_channel_user_unique
      ON chat_channel_members(channel_id, user_id)
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS chat_channel_members_user_idx
      ON chat_channel_members(user_id)
    `);
    /* Columnas esperadas por el servicio de chat (la migración Prisma inicial no las incluía). */
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE chat_channel_members
      ADD COLUMN IF NOT EXISTS role TEXT NULL
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE chat_channel_members
      ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NULL
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS chat_channel_members_channel_read_idx
      ON chat_channel_members(channel_id, last_read_at)
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE chat_channel_members
      ADD COLUMN IF NOT EXISTS hidden_from_ui_at TIMESTAMPTZ NULL
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE chat_channel_members
      ADD COLUMN IF NOT EXISTS history_cleared_before_at TIMESTAMPTZ NULL
    `);
    this.membershipTableReady = true;
  }

  /** Quita la marca de oculto para este usuario (p. ej. al abrir de nuevo un DM o el chat del ticket). */
  private async clearConversationHiddenForUser(channelId: string, userId: string) {
    await this.ensureMembershipTable();
    await this.prisma.$executeRaw`
      UPDATE chat_channel_members
      SET hidden_from_ui_at = NULL
      WHERE channel_id = ${channelId} AND user_id = ${userId}
    `;
  }

  /**
   * Oculta la conversación para el usuario actual sin borrar mensajes ni membresía de auditoría.
   */
  async hideConversationForUser(userId: string, channelId: string) {
    await this.ensureMembershipTable();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM chat_channel_members
      WHERE channel_id = ${channelId} AND user_id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) throw new NotFoundException('Membership not found');
    await this.prisma.$executeRaw`
      UPDATE chat_channel_members
      SET hidden_from_ui_at = NOW(),
          history_cleared_before_at = NOW()
      WHERE channel_id = ${channelId} AND user_id = ${userId}
    `;
    return { ok: true as const };
  }

  private async ensureChannelMember(channelId: string, userId: string) {
    await this.ensureMembershipTable();
    const memberId = `cm_${channelId}_${userId}`;
    await this.prisma.$executeRaw`
      INSERT INTO chat_channel_members(id, channel_id, user_id)
      VALUES (${memberId}, ${channelId}, ${userId})
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `;
  }

  private async addGroupMemberRow(channelId: string, userId: string, role: 'admin' | 'member') {
    await this.ensureMembershipTable();
    const memberId = `cm_${channelId}_${userId}`;
    await this.prisma.$executeRaw`
      INSERT INTO chat_channel_members(id, channel_id, user_id, role)
      VALUES (${memberId}, ${channelId}, ${userId}, ${role})
      ON CONFLICT (channel_id, user_id) DO NOTHING
    `;
  }

  async createGroup(creatorId: string, name: string, memberUserIds: string[]) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Invalid group name');

    const channel = await this.prisma.chatChannel.create({
      data: { channelType: 'group', name: trimmed },
    });

    await this.addGroupMemberRow(channel.id, creatorId, 'admin');

    const uniqueOthers = [...new Set(memberUserIds.filter((id) => id && id !== creatorId))];
    for (const uid of uniqueOthers) {
      const user = await this.prisma.user.findFirst({ where: { id: uid, isActive: true }, select: { id: true } });
      if (user) await this.addGroupMemberRow(channel.id, uid, 'member');
    }

    return channel;
  }

  private async getChannelOrThrow(channelId: string) {
    const channel = await this.prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async assertGroupAdmin(userId: string, channelId: string) {
    const channel = await this.getChannelOrThrow(channelId);
    if (channel.channelType !== 'group') throw new ForbiddenException('Not a group channel');

    const rows = await this.prisma.$queryRaw<{ role: string | null }[]>`
      SELECT role FROM chat_channel_members
      WHERE channel_id = ${channelId}
        AND user_id = ${userId}
        AND hidden_from_ui_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0 || rows[0].role !== 'admin') {
      throw new ForbiddenException('Group admin required');
    }
  }

  async listGroupMembers(viewerId: string, channelId: string) {
    await this.ensureUserInChannelOrThrow(viewerId, channelId);
    const channel = await this.getChannelOrThrow(channelId);
    if (channel.channelType !== 'group') throw new ForbiddenException('Not a group channel');

    return this.prisma.$queryRaw<
      { user_id: string; name: string; employee_id: string; role: string | null }[]
    >`
      SELECT m.user_id, u.name, u.employee_id AS employee_id, m.role
      FROM chat_channel_members m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ${channelId}
      ORDER BY CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END, u.name ASC
    `;
  }

  async addMemberToGroup(actorId: string, channelId: string, targetUserId: string) {
    await this.assertGroupAdmin(actorId, channelId);

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, isActive: true },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.addGroupMemberRow(channelId, targetUserId, 'member');
  }

  async removeMemberFromGroup(actorId: string, channelId: string, targetUserId: string) {
    await this.assertGroupAdmin(actorId, channelId);

    const adminCountRows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM chat_channel_members
      WHERE channel_id = ${channelId} AND role = 'admin'
    `;
    const adminCount = Number(adminCountRows[0]?.c ?? 0);

    const targetRows = await this.prisma.$queryRaw<{ role: string | null }[]>`
      SELECT role FROM chat_channel_members
      WHERE channel_id = ${channelId} AND user_id = ${targetUserId}
      LIMIT 1
    `;
    if (targetRows.length === 0) throw new NotFoundException('Member not in group');

    if (targetRows[0].role === 'admin' && adminCount <= 1) {
      throw new ForbiddenException('Cannot remove the last group administrator');
    }

    await this.prisma.$executeRaw`
      DELETE FROM chat_channel_members
      WHERE channel_id = ${channelId} AND user_id = ${targetUserId}
    `;
  }

  /** Any member can leave; the last remaining admin must promote someone else first. */
  async leaveGroup(userId: string, channelId: string) {
    const channel = await this.getChannelOrThrow(channelId);
    if (channel.channelType !== 'group') {
      throw new ForbiddenException('Only group channels can be left');
    }
    await this.ensureUserInChannelOrThrow(userId, channelId);

    const adminCountRows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM chat_channel_members
      WHERE channel_id = ${channelId} AND role = 'admin'
    `;
    const adminCount = Number(adminCountRows[0]?.c ?? 0);

    const targetRows = await this.prisma.$queryRaw<{ role: string | null }[]>`
      SELECT role FROM chat_channel_members
      WHERE channel_id = ${channelId} AND user_id = ${userId}
      LIMIT 1
    `;
    if (targetRows.length === 0) throw new NotFoundException('Not a member');
    if (targetRows[0].role === 'admin' && adminCount <= 1) {
      throw new ForbiddenException('Promote another administrator before leaving the group');
    }

    await this.prisma.$executeRaw`
      DELETE FROM chat_channel_members
      WHERE channel_id = ${channelId} AND user_id = ${userId}
    `;
  }

  private async ensureUsersInChannel(channelId: string, userIds: string[]) {
    const unique = [...new Set(userIds.filter(Boolean))];
    await Promise.all(unique.map((userId) => this.ensureChannelMember(channelId, userId)));
  }

  private async syncLegacyMemberships(userId: string) {
    await this.ensureMembershipTable();
    const ownedTickets = await this.prisma.ticket.findMany({
      where: { requesterId: userId },
      select: { id: true },
      take: 100,
    });
    for (const ticket of ownedTickets) {
      const channel = await this.ensureTicketChannel(userId, ticket.id);
      await this.ensureChannelMember(channel.id, userId);
    }

    const dmChannels = await this.prisma.chatChannel.findMany({
      where: { channelType: 'dm', name: { contains: userId } },
      select: { id: true, name: true },
      take: 100,
    });
    for (const dm of dmChannels) {
      const ids = (dm.name ?? '').replace('dm:', '').split(':').filter(Boolean);
      await this.ensureUsersInChannel(dm.id, ids);
    }
  }

  async ensureUserInChannelOrThrow(userId: string, channelId: string) {
    await this.ensureMembershipTable();
    const member = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM chat_channel_members
      WHERE channel_id = ${channelId}
        AND user_id = ${userId}
        AND hidden_from_ui_at IS NULL
      LIMIT 1
    `;
    if (member.length === 0) {
      throw new ForbiddenException('You are not a member of this channel');
    }
  }

  async getOrCreateDm(userAId: string, userBId: string) {
    if (userAId === userBId) {
      throw new NotFoundException('Cannot create self DM');
    }
    const [left, right] = [userAId, userBId].sort();
    const dmName = `dm:${left}:${right}`;
    const existing = await this.prisma.chatChannel.findFirst({
      where: { channelType: 'dm', name: dmName },
    });
    if (existing) {
      await this.ensureUsersInChannel(existing.id, [userAId, userBId]);
      await this.clearConversationHiddenForUser(existing.id, userAId);
      return existing;
    }
    const channel = await this.prisma.chatChannel.create({
      data: { channelType: 'dm', name: dmName },
    });
    await this.ensureUsersInChannel(channel.id, [userAId, userBId]);
    return channel;
  }

  async markRead(userId: string, channelId: string) {
    await this.ensureUserInChannelOrThrow(userId, channelId);
    await this.ensureMembershipTable();
    await this.prisma.$executeRaw`
      UPDATE chat_channel_members
      SET last_read_at = NOW()
      WHERE channel_id = ${channelId} AND user_id = ${userId}
    `;
    return { success: true };
  }

  private async buildUnreadCount(
    userId: string,
    channelId: string,
    lastReadAt?: Date | null,
    historyClearedBefore?: Date | null,
  ) {
    const tRead = (lastReadAt ?? new Date(0)).getTime();
    const tClear = (historyClearedBefore ?? new Date(0)).getTime();
    const effectiveFloor = new Date(Math.max(tRead, tClear));
    return this.prisma.chatMessage.count({
      where: {
        channelId,
        userId: { not: userId },
        createdAt: { gt: effectiveFloor },
      },
    });
  }

  /** Último mensaje visible para este usuario (respeta history_cleared_before_at del miembro). */
  private async lastMessagesForViewer(userId: string, channelIds: string[]) {
    const map = new Map<string, { body: string | null; createdAt: Date; authorName: string }>();
    if (channelIds.length === 0) return map;

    const rows = await this.prisma.$queryRaw<
      { channel_id: string; body: string | null; created_at: Date; author_name: string }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (m.channel_id)
        m.channel_id,
        m.body,
        m.created_at,
        u.name AS author_name
      FROM chat_messages m
      INNER JOIN users u ON u.id = m.user_id
      INNER JOIN chat_channel_members mem
        ON mem.channel_id = m.channel_id AND mem.user_id = ${userId}
      WHERE m.channel_id IN (${Prisma.join(channelIds)})
        AND m.created_at > COALESCE(mem.history_cleared_before_at, '1970-01-01'::timestamptz)
      ORDER BY m.channel_id, m.created_at DESC
    `);

    for (const row of rows) {
      map.set(row.channel_id, {
        body: row.body,
        createdAt: row.created_at,
        authorName: row.author_name,
      });
    }
    return map;
  }

  private sortChannelsByActivity<
    T extends { id: string; updated_at: string; last_message: { created_at: string } | null },
  >(list: T[]): T[] {
    return [...list].sort((a, b) => {
      const ta = new Date(a.last_message?.created_at ?? a.updated_at).getTime();
      const tb = new Date(b.last_message?.created_at ?? b.updated_at).getTime();
      return tb - ta;
    });
  }

  async getChannels(userId: string) {
    await this.syncLegacyMemberships(userId);

    const memberships = await this.prisma.$queryRaw<
      {
        channel_id: string;
        last_read_at: Date | null;
        my_role: string | null;
        history_cleared_before_at: Date | null;
      }[]
    >`
      SELECT channel_id, last_read_at, role AS my_role, history_cleared_before_at
      FROM chat_channel_members
      WHERE user_id = ${userId}
        AND hidden_from_ui_at IS NULL
      ORDER BY joined_at DESC
      LIMIT 100
    `;

    const channels = await this.prisma.chatChannel.findMany({
      where: { id: { in: memberships.map((membership) => membership.channel_id) } },
      include: { ticket: { select: { id: true, subject: true } } },
    });

    const combined = await Promise.all(
      memberships.map(async (membership) => {
        const channel = channels.find((item) => item.id === membership.channel_id);
        if (!channel) return null;
        let channelName = channel.name ?? 'Canal';
        if (channel.channelType === 'ticket' && channel.ticket?.subject) {
          channelName = channel.ticket.subject;
        }
        if (channel.channelType === 'dm') {
          const ids = (channel.name ?? '').replace('dm:', '').split(':').filter(Boolean);
          const otherUserId = ids.find((id) => id !== userId);
          if (otherUserId) {
            const otherUser = await this.prisma.user.findUnique({
              where: { id: otherUserId },
              select: { name: true },
            });
            if (otherUser?.name) channelName = otherUser.name;
          }
        }
        if (channel.channelType === 'group') {
          channelName = channel.name?.trim() || 'Grupo';
        }
        const unread_count = await this.buildUnreadCount(
          userId,
          channel.id,
          membership.last_read_at,
          membership.history_cleared_before_at,
        );
        const channel_type: 'dm' | 'ticket' | 'group' =
          channel.channelType === 'dm'
            ? 'dm'
            : channel.channelType === 'group'
              ? 'group'
              : 'ticket';
        const my_role =
          channel.channelType === 'group'
            ? membership.my_role === 'admin'
              ? 'admin'
              : membership.my_role === 'member'
                ? 'member'
                : null
            : null;

        return {
          id: channel.id,
          name: channelName,
          ticket_id: channel.ticketId,
          channel_type,
          my_role,
          unread_count,
          updated_at: channel.updatedAt.toISOString(),
        };
      }),
    );

    const ready = combined.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const lastMap = await this.lastMessagesForViewer(userId, ready.map((c) => c.id));

    const withPreview = ready.map((c) => {
      const last = lastMap.get(c.id);
      return {
        ...c,
        last_message: last
          ? {
              body: last.body,
              created_at: last.createdAt.toISOString(),
              author_name: last.authorName,
            }
          : null,
      };
    });

    return this.sortChannelsByActivity(withPreview);
  }

  private formatTicketChannelLabel(ticketNumber: bigint): string {
    return `TK-${ticketNumber.toString().padStart(6, '0')}`;
  }

  /** Solo el solicitante del ticket puede asegurar/crear el canal (misma regla que GET /tickets/:id). */
  async ensureTicketChannel(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, requesterId: userId },
      select: {
        id: true,
        ticketNumber: true,
        departmentId: true,
        requesterId: true,
        assignedTo: true,
        supervisorId: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const existing = await this.prisma.chatChannel.findUnique({ where: { ticketId } });
    const memberIds = [ticket.requesterId, ticket.assignedTo, ticket.supervisorId].filter(
      (x): x is string => Boolean(x),
    );
    if (existing) {
      await this.ensureUsersInChannel(existing.id, memberIds);
      await this.clearConversationHiddenForUser(existing.id, ticket.requesterId);
      return existing;
    }

    const channel = await this.prisma.chatChannel.create({
      data: {
        channelType: 'ticket',
        ticketId,
        departmentId: ticket.departmentId,
        name: `Ticket ${this.formatTicketChannelLabel(ticket.ticketNumber)}`,
      },
    });
    await this.ensureUsersInChannel(channel.id, memberIds);
    return channel;
  }

  /** Canal de ticket al crear el registro (solicitante + supervisor). */
  async provisionTicketChannel(params: {
    ticketId: string;
    departmentId: string;
    requesterId: string;
    supervisorId: string | null;
    ticketNumber: bigint;
  }) {
    const existing = await this.prisma.chatChannel.findUnique({ where: { ticketId: params.ticketId } });
    const label = this.formatTicketChannelLabel(params.ticketNumber);
    const ids = [params.requesterId, params.supervisorId].filter((x): x is string => Boolean(x));
    if (existing) {
      await this.ensureUsersInChannel(existing.id, ids);
      return existing;
    }
    const channel = await this.prisma.chatChannel.create({
      data: {
        channelType: 'ticket',
        ticketId: params.ticketId,
        departmentId: params.departmentId,
        name: `Ticket ${label}`,
      },
    });
    await this.ensureUsersInChannel(channel.id, ids);
    return channel;
  }

  async addUsersToTicketChannel(ticketId: string, userIds: string[]) {
    const channel = await this.prisma.chatChannel.findUnique({ where: { ticketId } });
    if (!channel) return;
    await this.ensureUsersInChannel(channel.id, userIds);
  }

  async getUserChannelIds(userId: string) {
    await this.syncLegacyMemberships(userId);
    const rows = await this.prisma.$queryRaw<{ channel_id: string }[]>`
      SELECT channel_id
      FROM chat_channel_members
      WHERE user_id = ${userId}
        AND hidden_from_ui_at IS NULL
      LIMIT 200
    `;
    return rows.map((row) => row.channel_id);
  }

  private messageInclude() {
    return {
      user: { select: { id: true, name: true, employeeId: true } },
      attachments: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          storageKey: true,
        },
      },
    } as const;
  }

  /**
   * Lista ids visibles para este miembro: el corte de historial se aplica en SQL (JOIN),
   * para que persista bien tras F5 y no dependa de comparar Date Prisma vs timestamptz raw.
   */
  private async listVisibleMessageIdsForMember(
    userId: string,
    channelId: string,
    limit: number,
    opts?: { beforeCreatedAt: Date; beforeId: string },
  ) {
    await this.ensureMembershipTable();
    if (opts) {
      return this.prisma.$queryRaw<{ id: string }[]>`
        SELECT m.id
        FROM chat_messages m
        INNER JOIN chat_channel_members mem
          ON mem.channel_id = m.channel_id AND mem.user_id = ${userId}
        WHERE m.channel_id = ${channelId}
          AND mem.hidden_from_ui_at IS NULL
          AND m.created_at > COALESCE(mem.history_cleared_before_at, '-infinity'::timestamptz)
          AND (
            m.created_at < ${opts.beforeCreatedAt}
            OR (m.created_at = ${opts.beforeCreatedAt} AND m.id < ${opts.beforeId})
          )
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${limit}
      `;
    }
    return this.prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id
      FROM chat_messages m
      INNER JOIN chat_channel_members mem
        ON mem.channel_id = m.channel_id AND mem.user_id = ${userId}
      WHERE m.channel_id = ${channelId}
        AND mem.hidden_from_ui_at IS NULL
        AND m.created_at > COALESCE(mem.history_cleared_before_at, '-infinity'::timestamptz)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${limit}
    `;
  }

  async getMessages(
    userId: string,
    channelId: string,
    opts?: { limit?: number; before?: string },
  ) {
    await this.ensureUserInChannelOrThrow(userId, channelId);
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);

    let beforeCursor: { created_at: Date; id: string } | undefined;
    if (opts?.before) {
      await this.ensureMembershipTable();
      const curRows = await this.prisma.$queryRaw<{ id: string; created_at: Date }[]>`
        SELECT m.id, m.created_at
        FROM chat_messages m
        INNER JOIN chat_channel_members mem
          ON mem.channel_id = m.channel_id AND mem.user_id = ${userId}
        WHERE m.id = ${opts.before}
          AND m.channel_id = ${channelId}
          AND mem.hidden_from_ui_at IS NULL
          AND m.created_at > COALESCE(mem.history_cleared_before_at, '-infinity'::timestamptz)
        LIMIT 1
      `;
      if (curRows.length === 0) throw new BadRequestException('Invalid before cursor');
      beforeCursor = { created_at: curRows[0].created_at, id: curRows[0].id };
    }

    const idRows = await this.listVisibleMessageIdsForMember(
      userId,
      channelId,
      limit,
      beforeCursor
        ? { beforeCreatedAt: beforeCursor.created_at, beforeId: beforeCursor.id }
        : undefined,
    );
    const idsDesc = idRows.map((r) => r.id);
    if (idsDesc.length === 0) {
      return { messages: [], has_more: false };
    }

    const rows = await this.prisma.chatMessage.findMany({
      where: { id: { in: idsDesc } },
      include: this.messageInclude(),
    });
    const byId = new Map(rows.map((m) => [m.id, m]));
    const messages = [...idsDesc]
      .reverse()
      .map((id) => byId.get(id))
      .filter((m): m is (typeof rows)[number] => m != null);
    return { messages, has_more: idsDesc.length === limit };
  }

  async sendMessage(channelId: string, userId: string, body: string) {
    await this.ensureUserInChannelOrThrow(userId, channelId);

    const message = await this.prisma.chatMessage.create({
      data: {
        channelId,
        userId,
        body,
      },
      include: this.messageInclude(),
    });

    return message;
  }

  async sendMessageWithOptionalFile(
    channelId: string,
    userId: string,
    body: string,
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    await this.ensureUserInChannelOrThrow(userId, channelId);
    const text = (body ?? '').trim();
    if (!text && !file) {
      throw new BadRequestException('Message body or file required');
    }
    if (file && file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 10MB)');
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        channelId,
        userId,
        body: text || null,
      },
      include: this.messageInclude(),
    });

    if (file) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
      const key = `chat/${channelId}/${msg.id}/${Date.now()}-${safeName}`;
      await this.storage.putObject(key, file.buffer, file.mimetype);
      await this.prisma.chatAttachment.create({
        data: {
          messageId: msg.id,
          storageKey: key,
          originalName: file.originalname.slice(0, 255),
          mimeType: file.mimetype.slice(0, 127),
          sizeBytes: file.size,
        },
      });
    }

    return this.prisma.chatMessage.findUniqueOrThrow({
      where: { id: msg.id },
      include: this.messageInclude(),
    });
  }

  async getAttachmentDownloadUrl(userId: string, attachmentId: string) {
    const row = await this.prisma.chatAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } },
    });
    if (!row) throw new NotFoundException('Attachment not found');
    await this.ensureUserInChannelOrThrow(userId, row.message.channelId);
    const url = await this.storage.getSignedGetUrl(row.storageKey);
    return { url, file_name: row.originalName, mime_type: row.mimeType };
  }
}
