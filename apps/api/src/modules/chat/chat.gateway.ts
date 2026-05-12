import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { JwtUserPayload } from '../../common/auth/jwt-user.payload';
import { ChatService } from './chat.service';

type ChatMessagePayload = Awaited<ReturnType<ChatService['sendMessage']>>;

@WebSocketGateway({
  cors: { origin: true, credentials: true, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly typingLast = new Map<string, number>();
  /** Anti-spam zumbidos: clave `userId:channelId` → último envío (ms). */
  private readonly nudgeLast = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  /** Emite un mensaje a todos los clientes unidos al canal (p. ej. envío vía REST). */
  /** Generic emit for ticket lifecycle events on a chat channel room. */
  emitToRoom(roomId: string, event: string, data: unknown) {
    this.server.to(roomId).emit(event, data);
  }

  broadcastChannelMessage(channelId: string, message: ChatMessagePayload) {
    this.server.to(channelId).emit('chat:message', { channel_id: channelId, message });
  }

  /** Asegura que todos los sockets de los usuarios indicados estén en la sala del canal (DM nuevo, etc.). */
  ensureSocketsInRoom(channelId: string, userIds: string[]) {
    const want = new Set(userIds);
    for (const socket of this.server.sockets.sockets.values()) {
      const uid = socket.data.userId as string | undefined;
      if (uid && want.has(uid)) {
        void socket.join(channelId);
      }
    }
  }

  /**
   * Alinea las salas del socket con los canales visibles del usuario (membresía sin ocultar).
   * Sale de salas de canal que ya no aplican (p. ej. tras ocultar conversación o salir de un grupo)
   * para no seguir recibiendo `chat:message`. No toca `dept:*` ni la sala propia del socket.
   */
  private async joinAllChannelsForUser(client: Socket, userId: string) {
    const channelIds = await this.chatService.getUserChannelIds(userId);
    const want = new Set(channelIds);
    for (const room of client.rooms) {
      if (room === client.id) continue;
      if (room.startsWith('dept:')) continue;
      if (!want.has(room)) {
        void client.leave(room);
      }
    }
    for (const channelId of channelIds) {
      void client.join(channelId);
    }
  }

  private async emitPresenceUpdate() {
    for (const socket of this.server.sockets.sockets.values()) {
      const uid = socket.data.userId as string | undefined;
      if (!uid) continue;
      const online_user_ids = await this.chatService.getPresenceForUser(uid);
      socket.emit('chat:presence', { online_user_ids });
    }
  }

  async handleConnection(client: Socket) {
    try {
      const rawToken =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!rawToken) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtUserPayload>(rawToken);

      client.data.userId = payload.sub;
      this.chatService.setUserOnline(payload.sub);
      await this.joinAllChannelsForUser(client, payload.sub);
      const dr = payload.department_roles ?? [];
      for (const d of dr) {
        void client.join(`dept:${d.departmentId}`);
      }
      if (payload.global_role === 'admin' || payload.global_role === 'auditor') {
        void client.join('dept:all');
      }
      await this.emitPresenceUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Socket rechazado (${client.id}): ${msg}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    this.chatService.setUserOffline(userId);
    void this.emitPresenceUpdate();
  }

  @SubscribeMessage('chat:sync-rooms')
  async onSyncRooms(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false as const };
    await this.joinAllChannelsForUser(client, userId);
    const online_user_ids = await this.chatService.getPresenceForUser(userId);
    client.emit('chat:presence', { online_user_ids });
    return { ok: true as const };
  }

  @SubscribeMessage('chat:typing')
  async onTyping(client: Socket, body: { channel_id: string; typing: boolean }) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.channel_id) return { ok: false as const };
    try {
      await this.chatService.ensureUserInChannelOrThrow(userId, body.channel_id);
    } catch {
      return { ok: false as const };
    }
    if (body.typing) {
      const key = `${userId}:${body.channel_id}`;
      const now = Date.now();
      if ((this.typingLast.get(key) ?? 0) > now - 2500) return { ok: true as const };
      this.typingLast.set(key, now);
    }
    client.to(body.channel_id).emit('chat:typing', {
      channel_id: body.channel_id,
      user_id: userId,
      typing: Boolean(body.typing),
    });
    return { ok: true as const };
  }

  @SubscribeMessage('chat:send')
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channel_id: string; body: string; message_type?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.channel_id) {
      return { ok: false as const, error: 'invalid' as const };
    }

    if (body.message_type === 'nudge') {
      const key = `${userId}:${body.channel_id}`;
      const now = Date.now();
      if ((this.nudgeLast.get(key) ?? 0) > now - 15_000) {
        return { ok: false as const, error: 'rate_limited' as const };
      }
      try {
        await this.chatService.ensureUserInChannelOrThrow(userId, body.channel_id);
      } catch {
        return { ok: false as const, error: 'forbidden' as const };
      }
      this.nudgeLast.set(key, now);
      const message = await this.chatService.sendMessage(body.channel_id, userId, '', { messageType: 'nudge' });
      this.broadcastChannelMessage(body.channel_id, message);
      return { ok: true as const };
    }

    if (!body?.body?.trim()) {
      return { ok: false as const, error: 'invalid' as const };
    }

    const message = await this.chatService.sendMessage(body.channel_id, userId, body.body.trim());
    this.broadcastChannelMessage(body.channel_id, message);
    return { ok: true as const };
  }
}
