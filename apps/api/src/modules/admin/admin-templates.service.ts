import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateFieldDto } from './dto/create-template-field.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { UpdateTemplateFieldDto } from './dto/update-template-field.dto';

@Injectable()
export class AdminTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  listTemplates() {
    return this.prisma.template.findMany({
      orderBy: { name: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        fields: { orderBy: { fieldKey: 'asc' } },
      },
    });
  }

  async createTemplate(dto: CreateTemplateDto, actorUserId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: dto.department_id } });
    if (!dept) throw new NotFoundException('Departamento no encontrado');
    const row = await this.prisma.template.create({
      data: {
        departmentId: dto.department_id,
        name: dto.name.trim(),
        usageType: dto.usage_type.trim(),
        isActive: dto.is_active ?? true,
      },
      include: { department: { select: { id: true, name: true } }, fields: true },
    });
    this.audit.record({
      action: 'settings.template_created',
      actorUserId,
      resource: row.id,
      meta: { name: row.name },
    });
    return row;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, actorUserId: string) {
    const existing = await this.prisma.template.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plantilla no encontrada');
    const row = await this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.usage_type != null ? { usageType: dto.usage_type.trim() } : {}),
        ...(dto.is_active != null ? { isActive: dto.is_active } : {}),
      },
    });
    this.audit.record({
      action: 'settings.template_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async createField(templateId: string, dto: CreateTemplateFieldDto, actorUserId: string) {
    const tpl = await this.prisma.template.findUnique({ where: { id: templateId } });
    if (!tpl) throw new NotFoundException('Plantilla no encontrada');
    const config = (dto.config_json ?? {}) as Prisma.InputJsonValue;
    const row = await this.prisma.templateField.create({
      data: {
        templateId,
        fieldKey: dto.field_key.trim(),
        fieldLabel: dto.field_label.trim(),
        fieldType: dto.field_type.trim(),
        isRequired: dto.is_required ?? false,
        configJson: config,
      },
    });
    this.audit.record({
      action: 'settings.template_field_created',
      actorUserId,
      resource: row.id,
      meta: { templateId, field_key: row.fieldKey },
    });
    return row;
  }

  async updateField(fieldId: string, dto: UpdateTemplateFieldDto, actorUserId: string) {
    const existing = await this.prisma.templateField.findUnique({ where: { id: fieldId } });
    if (!existing) throw new NotFoundException('Campo no encontrado');
    const row = await this.prisma.templateField.update({
      where: { id: fieldId },
      data: {
        ...(dto.field_key != null ? { fieldKey: dto.field_key.trim() } : {}),
        ...(dto.field_label != null ? { fieldLabel: dto.field_label.trim() } : {}),
        ...(dto.field_type != null ? { fieldType: dto.field_type.trim() } : {}),
        ...(dto.is_required != null ? { isRequired: dto.is_required } : {}),
        ...(dto.config_json !== undefined ? { configJson: dto.config_json as Prisma.InputJsonValue } : {}),
      },
    });
    this.audit.record({
      action: 'settings.template_field_updated',
      actorUserId,
      resource: fieldId,
      meta: { fields: Object.keys(dto) },
    });
    return row;
  }

  async deleteField(fieldId: string, actorUserId: string) {
    const existing = await this.prisma.templateField.findUnique({ where: { id: fieldId } });
    if (!existing) throw new NotFoundException('Campo no encontrado');
    await this.prisma.templateField.delete({ where: { id: fieldId } });
    this.audit.record({
      action: 'settings.template_field_deleted',
      actorUserId,
      resource: fieldId,
    });
    return { ok: true as const };
  }
}
