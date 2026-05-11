import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateTicketPriorityDto } from './dto/create-ticket-priority.dto';
import { CreateTicketStatusDto } from './dto/create-ticket-status.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get('departments')
  @ApiOperation({ summary: 'Listar departamentos (incl. inactivos)' })
  listDepartments() {
    return this.catalog.listDepartments();
  }

  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto, @CurrentUser() user: UserPayload) {
    return this.catalog.createDepartment(dto, user.userId);
  }

  @Patch('departments/:id')
  updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.catalog.updateDepartment(id, dto, user.userId);
  }

  @Get('ticket-statuses')
  listStatuses() {
    return this.catalog.listTicketStatuses();
  }

  @Post('ticket-statuses')
  createStatus(@Body() dto: CreateTicketStatusDto, @CurrentUser() user: UserPayload) {
    return this.catalog.createTicketStatus(dto, user.userId);
  }

  @Patch('ticket-statuses/:id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.catalog.updateTicketStatus(id, dto, user.userId);
  }

  @Delete('ticket-statuses/:id')
  deleteStatus(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.catalog.deleteTicketStatus(id, user.userId);
  }

  @Get('ticket-priorities')
  listPriorities() {
    return this.catalog.listTicketPriorities();
  }

  @Post('ticket-priorities')
  createPriority(@Body() dto: CreateTicketPriorityDto, @CurrentUser() user: UserPayload) {
    return this.catalog.createTicketPriority(dto, user.userId);
  }

  @Patch('ticket-priorities/:id')
  updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateTicketPriorityDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.catalog.updateTicketPriority(id, dto, user.userId);
  }

  @Delete('ticket-priorities/:id')
  deletePriority(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.catalog.deleteTicketPriority(id, user.userId);
  }
}
