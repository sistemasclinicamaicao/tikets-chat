import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(userId: string, token: string, platform?: string) {
    const plat = (platform ?? 'android').trim().slice(0, 32) || 'android';
    await this.prisma.userPushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, platform: plat },
      update: { platform: plat },
    });
    return { ok: true as const };
  }

  /**
   * Envía FCM a dispositivos registrados (excluye al autor). Si `FCM_SERVICE_ACCOUNT_JSON`
   * no está definido, no hace nada (desarrollo / sin Firebase).
   */
  async notifyChatMessage(params: {
    memberUserIds: string[];
    excludeUserId: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<void> {
    const recipients = params.memberUserIds.filter((id) => id !== params.excludeUserId);
    if (recipients.length === 0) return;

    const rows = await this.prisma.userPushToken.findMany({
      where: { userId: { in: recipients } },
      select: { token: true },
    });
    const tokens = [...new Set(rows.map((r) => r.token))];
    if (tokens.length === 0) return;

    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.debug('FCM_SERVICE_ACCOUNT_JSON unset; skip FCM multicast');
      return;
    }

    let parsed: { project_id?: string; client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      this.logger.warn('FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const admin = require('firebase-admin') as typeof import('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
          }),
        });
      }
      const messaging = admin.messaging();
      const chunkSize = 500;
      for (let i = 0; i < tokens.length; i += chunkSize) {
        const slice = tokens.slice(i, i + chunkSize);
        const res = await messaging.sendEachForMulticast({
          tokens: slice,
          notification: { title: params.title, body: params.body },
          data: params.data,
          android: { priority: 'high' },
        });
        if (res.failureCount > 0) {
          this.logger.warn(`FCM partial failure: ${res.failureCount}/${slice.length}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`FCM send failed: ${msg}`);
    }
  }
}
