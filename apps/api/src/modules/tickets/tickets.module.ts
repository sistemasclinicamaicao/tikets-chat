import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { TicketEventsService } from './ticket-events.service';
import { TicketFormService } from './ticket-form.service';
import { TicketWorkflowsService } from './ticket-workflows.service';
import { TicketsController } from './tickets.controller';
import { TicketsRealtimeService } from './tickets-realtime.service';
import { TicketsService } from './tickets.service';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketEventsService,
    TicketFormService,
    TicketWorkflowsService,
    TicketsRealtimeService,
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
