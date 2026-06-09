import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminGthDirectoryService } from './admin-gth-directory.service';

const DEFAULT_CRON = '0 0 8,12,16 * * *';
const DEFAULT_TIMEZONE = 'America/Bogota';

@Injectable()
export class GthDirectorySyncScheduler {
  private readonly logger = new Logger(GthDirectorySyncScheduler.name);
  private running = false;

  constructor(private readonly gthDirectory: AdminGthDirectoryService) {}

  @Cron(process.env.GTH_DIRECTORY_SYNC_CRON ?? DEFAULT_CRON, {
    name: 'gth-directory-sync',
    timeZone: process.env.GTH_DIRECTORY_SYNC_TIMEZONE ?? DEFAULT_TIMEZONE,
    disabled: process.env.GTH_DIRECTORY_SYNC_ENABLED === 'false',
  })
  async handleScheduledSync(): Promise<void> {
    if (this.running) {
      this.logger.warn('GTH directory sync skipped: previous run still in progress');
      return;
    }

    this.running = true;
    try {
      const result = await this.gthDirectory.syncFromIntegration(null);
      if (result.ok) {
        this.logger.log(
          `GTH directory scheduled sync OK: ${result.imported} imported, ${result.records_upserted ?? 0} Comunicaciones upserted`,
        );
      } else {
        this.logger.warn(`GTH directory scheduled sync failed: ${result.error ?? 'unknown error'}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GTH directory scheduled sync error: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
