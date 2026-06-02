import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminGthDirectoryService } from './admin-gth-directory.service';
import { AdminUsersService } from './admin-users.service';
import { GthUserSyncService } from './gth-user-sync.service';
import { SetUserDepartmentRolesDto } from './dto/set-user-department-roles.dto';
import { UpdateUserGlobalRoleDto } from './dto/update-user-global-role.dto';

@ApiTags('admin-users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly gthDirectory: AdminGthDirectoryService,
    private readonly gthUserSync: GthUserSyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios del sistema (paginado, búsqueda y filtros)' })
  list(
    @Query('skip') skipStr?: string,
    @Query('take') takeStr?: string,
    @Query('q') q?: string,
    @Query('global_role') globalRole?: string,
    @Query('is_active') isActiveStr?: string,
  ) {
    const skip = skipStr ? parseInt(skipStr, 10) : 0;
    const take = takeStr ? parseInt(takeStr, 10) : 50;
    let global_role: 'admin' | 'auditor' | 'none' | undefined;
    if (globalRole === 'admin' || globalRole === 'auditor' || globalRole === 'none') {
      global_role = globalRole;
    }
    let is_active: boolean | undefined;
    if (isActiveStr === 'true' || isActiveStr === '1') is_active = true;
    else if (isActiveStr === 'false' || isActiveStr === '0') is_active = false;

    return this.users.listUsers({
      skip: Number.isFinite(skip) ? skip : 0,
      take: Number.isFinite(take) ? take : 50,
      q: q?.trim() || undefined,
      global_role,
      is_active,
    });
  }

  @Get('gth')
  @ApiOperation({
    summary: 'Directorio GTH (tabla interna gth_directory)',
    description:
      'Lee la copia local en PostgreSQL. Use POST gth/sync para importar desde CONEXION-GTH. ' +
      'Query last_sync_additions=true incluye detalle de altas de la última sincronización.',
  })
  getGthDirectory(
    @Query('last_sync_additions') lastSyncAdditions?: string,
    /** Alias legacy (singular) usado por builds antiguos del frontend. */
    @Query('last_sync_addition') lastSyncAddition?: string,
  ) {
    const flag = lastSyncAdditions ?? lastSyncAddition;
    return this.gthDirectory.listFromDb({
      lastSyncAdditions: flag === 'true' || flag === '1',
    });
  }

  @Post('gth/sync')
  @ApiOperation({
    summary: 'Sincronizar directorio GTH desde CONEXION-GTH',
    description:
      'Importa desde la integración con diff por cédula: actualiza gth_directory, tabla users (login OTP) y registros de Comunicaciones.',
  })
  syncGthDirectory(@CurrentUser() user: UserPayload) {
    return this.gthDirectory.syncFromIntegration(user.userId);
  }

  @Post('gth/sync-users')
  @ApiOperation({
    summary: 'Actualizar usuarios del sistema desde gth_directory',
    description:
      'Propaga la copia local GTH a la tabla users sin llamar al API externo. Útil tras revisar el directorio en la pestaña GTH.',
  })
  syncUsersFromGthDirectory() {
    return this.gthUserSync.syncFromDirectory();
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
