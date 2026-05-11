import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyTicketCreated(ticketId: string, departmentId: string): Promise<void> {
    this.logger.log(`notifyTicketCreated ticket=${ticketId} dept=${departmentId}`);
  }

  async notifyTicketAssigned(ticketId: string, assigneeUserId: string): Promise<void> {
    this.logger.log(`notifyTicketAssigned ticket=${ticketId} assignee=${assigneeUserId}`);
  }

  async notifyStatusChanged(ticketId: string, fromCode: string, toCode: string): Promise<void> {
    this.logger.log(`notifyStatusChanged ticket=${ticketId} ${fromCode} -> ${toCode}`);
  }

  async notifyTicketClosed(ticketId: string): Promise<void> {
    this.logger.log(`notifyTicketClosed ticket=${ticketId}`);
  }
}
