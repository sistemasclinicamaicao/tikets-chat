import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AdminIntegrationsService } from './admin-integrations.service';
import { AdminRuntimeController } from './admin-runtime.controller';
import { AdminTemplatesController } from './admin-templates.controller';
import { AdminTemplatesService } from './admin-templates.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminWorkflowsController } from './admin-workflows.controller';
import { AdminWorkflowsService } from './admin-workflows.service';

@Module({
  controllers: [
    AdminCatalogController,
    AdminWorkflowsController,
    AdminTemplatesController,
    AdminRuntimeController,
    AdminUsersController,
    AdminIntegrationsController,
  ],
  providers: [
    RolesGuard,
    AdminCatalogService,
    AdminWorkflowsService,
    AdminTemplatesService,
    AdminUsersService,
    AdminIntegrationsService,
  ],
  exports: [AdminIntegrationsService],
})
export class AdminModule {}
