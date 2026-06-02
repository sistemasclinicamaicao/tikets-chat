import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminIntegrationsService } from './admin-integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@ApiTags('admin-integrations')
@ApiBearerAuth('access-token')
@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminIntegrationsController {
  constructor(private readonly integrations: AdminIntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar integraciones API (sin secretos)' })
  list() {
    return this.integrations.list();
  }

  @Post()
  @ApiOperation({ summary: 'Crear integración' })
  create(@Body() dto: CreateIntegrationDto, @CurrentUser() user: UserPayload) {
    return this.integrations.create(dto, user.userId);
  }

  @Get('gth-directory')
  @ApiOperation({
    summary: 'Directorio GTH (integración CONEXION-GTH)',
    description: 'GET a la URL configurada; filas normalizadas para Usuarios → GTH.',
  })
  getGthDirectory(@CurrentUser() user: UserPayload) {
    return this.integrations.fetchGthDirectory(user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar integración' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.integrations.update(id, dto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar integración' })
  remove(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.integrations.remove(id, user.userId);
  }

  @Post(':id/probe')
  @ApiOperation({ summary: 'Probar conectividad GET a la URL base con credenciales guardadas' })
  probe(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.integrations.probe(id, user.userId);
  }
}
