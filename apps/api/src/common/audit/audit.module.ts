import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { HttpAccessLogInterceptor } from './http-access-log.interceptor';

@Global()
@Module({
  providers: [
    AuditLogService,
    { provide: APP_INTERCEPTOR, useClass: HttpAccessLogInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
