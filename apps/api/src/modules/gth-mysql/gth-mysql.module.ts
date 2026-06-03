import { Module } from '@nestjs/common';
import { GthHostingerMysqlService } from './gth-hostinger-mysql.service';
import { GthMysqlPhotoSyncService } from './gth-mysql-photo-sync.service';
import { GthMysqlRetryScheduler } from './gth-mysql-retry.scheduler';

@Module({
  providers: [GthHostingerMysqlService, GthMysqlPhotoSyncService, GthMysqlRetryScheduler],
  exports: [GthHostingerMysqlService, GthMysqlPhotoSyncService],
})
export class GthMysqlModule {}
