import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { TicketEventsService } from '../tickets/ticket-events.service';
import { GthPhotoSyncService } from './gth-photo-sync.service';

@Module({
  imports: [PrismaModule, StorageModule, NotificationsModule, forwardRef(() => ChatModule)],
  providers: [GthPhotoSyncService, TicketEventsService],
  exports: [GthPhotoSyncService],
})
export class GthPhotoModule {}
