import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DepartmentUsersController } from './department-users.controller';
import { DepartmentUsersService } from './department-users.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [DepartmentUsersController],
  providers: [DepartmentUsersService],
})
export class DepartmentUsersModule {}
