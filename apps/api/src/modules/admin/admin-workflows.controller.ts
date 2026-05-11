import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminWorkflowsService } from './admin-workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { CreateWorkflowTransitionDto } from './dto/create-workflow-transition.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { UpdateWorkflowTransitionDto } from './dto/update-workflow-transition.dto';

@ApiTags('admin-workflows')
@ApiBearerAuth('access-token')
@Controller('admin/workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminWorkflowsController {
  constructor(private readonly workflows: AdminWorkflowsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar definiciones de flujo y transiciones' })
  list() {
    return this.workflows.listWorkflows();
  }

  @Post()
  create(@Body() dto: CreateWorkflowDto, @CurrentUser() user: UserPayload) {
    return this.workflows.createWorkflow(dto, user.userId);
  }

  @Patch(':workflowId')
  update(
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.workflows.updateWorkflow(workflowId, dto, user.userId);
  }

  @Post(':workflowId/transitions')
  addTransition(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateWorkflowTransitionDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.workflows.createTransition(workflowId, dto, user.userId);
  }

  @Patch('transitions/:transitionId')
  updateTransition(
    @Param('transitionId') transitionId: string,
    @Body() dto: UpdateWorkflowTransitionDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.workflows.updateTransition(transitionId, dto, user.userId);
  }

  @Delete('transitions/:transitionId')
  deleteTransition(
    @Param('transitionId') transitionId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.workflows.deleteTransition(transitionId, user.userId);
  }
}
