import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GthHostingerMysqlService } from './gth-hostinger-mysql.service';
import { GthMysqlPhotoSyncService } from './gth-mysql-photo-sync.service';

@Injectable()
export class GthMysqlRetryScheduler {
  private readonly logger = new Logger(GthMysqlRetryScheduler.name);
  private running = false;

  constructor(
    private readonly mysql: GthHostingerMysqlService,
    private readonly sync: GthMysqlPhotoSyncService,
  ) {}

  @Cron(process.env.GTH_MYSQL_SYNC_RETRY_CRON ?? CronExpression.EVERY_10_MINUTES)
  async handleRetry(): Promise<void> {
    if (!this.mysql.isConfigured()) return;
    if (this.running) return;

    this.running = true;
    try {
      await this.sync.retryPending();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MySQL retry cron error: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
