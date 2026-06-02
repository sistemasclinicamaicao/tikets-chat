import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { DepartmentUsersService } from './department-users.service';
import { UpsertDepartmentUserDto } from './dto/upsert-department-user.dto';

@ApiTags('departments')
@ApiBearerAuth('access-token')
@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentUsersController {
  constructor(private readonly departmentUsers: DepartmentUsersService) {}

  @Get(':departmentId/users/search')
  @ApiOperation({ summary: 'Buscar usuarios activos para agregar al departamento' })
  searchCandidates(
    @Param('departmentId') departmentId: string,
    @Query('q') q: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.departmentUsers.searchCandidates(departmentId, user, q ?? '');
  }

  @Get(':departmentId/users')
  @ApiOperation({ summary: 'Miembros del departamento (admin global o dept_admin)' })
  listMembers(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.departmentUsers.listMembers(departmentId, user);
  }

  @Put(':departmentId/users/:userId')
  @ApiOperation({ summary: 'Asignar o actualizar rol en el departamento' })
  upsertMember(
    @Param('departmentId') departmentId: string,
    @Param('userId') userId: string,
    @Body() dto: UpsertDepartmentUserDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.departmentUsers.upsertMember(departmentId, userId, dto, user);
  }

  @Delete(':departmentId/users/:userId')
  @ApiOperation({ summary: 'Quitar usuario del departamento' })
  removeMember(
    @Param('departmentId') departmentId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.departmentUsers.removeMember(departmentId, userId, user);
  }
}
