import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import * as path from 'path';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthController } from './health.controller';
import { RootController } from './root.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ChatModule } from './modules/chat/chat.module';
import { MailModule } from './modules/mail/mail.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SlaModule } from './modules/sla/sla.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DepartmentUsersModule } from './modules/department-users/department-users.module';
import { GthMysqlModule } from './modules/gth-mysql/gth-mysql.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /** Siempre `apps/api/.env` aunque el proceso se lance con cwd en la raíz del monorepo (p. ej. INTEGRATIONS_ENCRYPTION_KEY). */
      envFilePath: path.join(__dirname, '..', '.env'),
    }),
    ScheduleModule.forRoot(),
    AuditModule,
    AdminModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    StorageModule,
    NotificationsModule,
    SlaModule,
    LifecycleModule,
    AuthModule,
    MailModule,
    TicketsModule,
    ChatModule,
    InventoryModule,
    DepartmentUsersModule,
    GthMysqlModule,
  ],
  controllers: [RootController, HealthController],
})
export class AppModule {}
