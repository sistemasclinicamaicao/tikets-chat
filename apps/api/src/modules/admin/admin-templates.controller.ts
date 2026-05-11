import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminTemplatesService } from './admin-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateFieldDto } from './dto/create-template-field.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { UpdateTemplateFieldDto } from './dto/update-template-field.dto';

@ApiTags('admin-templates')
@ApiBearerAuth('access-token')
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminTemplatesController {
  constructor(private readonly templates: AdminTemplatesService) {}

  @Get()
  list() {
    return this.templates.listTemplates();
  }

  @Post()
  create(@Body() dto: CreateTemplateDto, @CurrentUser() user: UserPayload) {
    return this.templates.createTemplate(dto, user.userId);
  }

  /** Rutas estáticas antes de `:templateId` para no capturar el segmento `fields`. */
  @Patch('fields/:fieldId')
  updateField(
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateTemplateFieldDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.templates.updateField(fieldId, dto, user.userId);
  }

  @Delete('fields/:fieldId')
  deleteField(@Param('fieldId') fieldId: string, @CurrentUser() user: UserPayload) {
    return this.templates.deleteField(fieldId, user.userId);
  }

  @Post(':templateId/fields')
  addField(
    @Param('templateId') templateId: string,
    @Body() dto: CreateTemplateFieldDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.templates.createField(templateId, dto, user.userId);
  }

  @Patch(':templateId')
  update(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.templates.updateTemplate(templateId, dto, user.userId);
  }
}
