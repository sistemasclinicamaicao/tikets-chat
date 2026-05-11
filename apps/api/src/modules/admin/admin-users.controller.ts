import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminUsersService } from './admin-users.service';
import { SetUserDepartmentRolesDto } from './dto/set-user-department-roles.dto';
import { UpdateUserGlobalRoleDto } from './dto/update-user-global-role.dto';

@ApiTags('admin-users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (paginado)' })
  list(@Query('skip') skipStr?: string, @Query('take') takeStr?: string) {
    const skip = skipStr ? parseInt(skipStr, 10) : 0;
    const take = takeStr ? parseInt(takeStr, 10) : 50;
    return this.users.listUsers(Number.isFinite(skip) ? skip : 0, Number.isFinite(take) ? take : 50);
  }

  @Patch(':userId/global-role')
  updateGlobalRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserGlobalRoleDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.users.updateGlobalRole(userId, dto, user.userId);
  }

  @Put(':userId/department-roles')
  setDeptRoles(
    @Param('userId') userId: string,
    @Body() dto: SetUserDepartmentRolesDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.users.setDepartmentRoles(userId, dto, user.userId);
  }
}
