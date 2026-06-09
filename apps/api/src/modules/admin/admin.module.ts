import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminGthComunicacionesRecordsService } from './admin-gth-comunicaciones-records.service';
import { AdminGthDirectoryService } from './admin-gth-directory.service';
import { GthUserSyncService } from './gth-user-sync.service';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminIntegrationsService } from './admin-integrations.service';
import { AdminRuntimeController } from './admin-runtime.controller';
import { AdminTemplatesController } from './admin-templates.controller';
import { AdminTemplatesService } from './admin-templates.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminWorkflowsController } from './admin-workflows.controller';
import { AdminWorkflowsService } from './admin-workflows.service';
import { ComunicacionesController } from './comunicaciones.controller';
import { GthDirectorySyncScheduler } from './gth-directory-sync.scheduler';
import { GthMysqlModule } from '../gth-mysql/gth-mysql.module';

@Module({
  imports: [GthMysqlModule],
  controllers: [
    AdminCatalogController,
    AdminWorkflowsController,
    AdminTemplatesController,
    AdminRuntimeController,
    AdminUsersController,
    AdminIntegrationsController,
    ComunicacionesController,
  ],
  providers: [
    RolesGuard,
    AdminCatalogService,
    AdminWorkflowsService,
    AdminTemplatesService,
    AdminUsersService,
    AdminGthDirectoryService,
    AdminGthComunicacionesRecordsService,
    GthUserSyncService,
    AdminIntegrationsService,
    GthDirectorySyncScheduler,
  ],
  exports: [AdminIntegrationsService, AdminGthComunicacionesRecordsService, GthUserSyncService],
})
export class AdminModule {}
