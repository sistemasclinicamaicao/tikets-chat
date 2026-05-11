import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PrismaTransaction } from './ticket-events.service';

@Injectable()
export class TicketFormService {
  constructor(private readonly prisma: PrismaService) {}

  async validateAndSave(
    params: {
      ticketId: string;
      templateId: string;
      formValues: Array<{ templateFieldId: string; value: unknown }>;
    },
    db: PrismaTransaction | PrismaService = this.prisma,
  ): Promise<void> {
    const fields = await db.templateField.findMany({
      where: { templateId: params.templateId },
    });
    const errors: string[] = [];
    const byId = new Map(fields.map((f) => [f.id, f]));

    for (const fv of params.formValues) {
      const field = byId.get(fv.templateFieldId);
      if (!field) {
        errors.push(`Campo desconocido: ${fv.templateFieldId}`);
        continue;
      }
      const val = fv.value;
      if (field.isRequired && (val === undefined || val === null || val === '')) {
        errors.push(`"${field.fieldLabel}" es obligatorio`);
        continue;
      }
      if (val === undefined || val === null) continue;

      const cfg = (field.configJson ?? {}) as { options?: string[] };
      const opts = Array.isArray(cfg.options) ? cfg.options : undefined;

      switch (field.fieldType) {
        case 'text':
        case 'textarea':
          if (typeof val !== 'string') errors.push(`"${field.fieldLabel}" debe ser texto`);
          break;
        case 'number':
          if (typeof val !== 'number' || Number.isNaN(val)) errors.push(`"${field.fieldLabel}" debe ser número`);
          break;
        case 'boolean':
          if (typeof val !== 'boolean') errors.push(`"${field.fieldLabel}" debe ser booleano`);
          break;
        case 'select':
          if (typeof val !== 'string') {
            errors.push(`"${field.fieldLabel}" debe ser texto (select)`);
          } else if (opts && !opts.includes(val)) {
            errors.push(`"${field.fieldLabel}": valor no permitido`);
          }
          break;
        case 'multiselect':
          if (!Array.isArray(val)) {
            errors.push(`"${field.fieldLabel}" debe ser un arreglo`);
          } else if (opts) {
            for (const v of val) {
              if (typeof v !== 'string' || !opts.includes(v)) {
                errors.push(`"${field.fieldLabel}": valor multiselect no permitido`);
                break;
              }
            }
          }
          break;
        default:
          break;
      }
    }

    for (const field of fields) {
      if (!field.isRequired) continue;
      const has = params.formValues.some(
        (x) => x.templateFieldId === field.id && x.value !== undefined && x.value !== null && x.value !== '',
      );
      if (!has) errors.push(`"${field.fieldLabel}" es obligatorio`);
    }

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Errores de validación del formulario', errors });
    }

    for (const fv of params.formValues) {
      await db.ticketFormValue.upsert({
        where: {
          ticketId_templateFieldId: {
            ticketId: params.ticketId,
            templateFieldId: fv.templateFieldId,
          },
        },
        create: {
          ticketId: params.ticketId,
          templateFieldId: fv.templateFieldId,
          valueJson: fv.value as Prisma.InputJsonValue,
        },
        update: {
          valueJson: fv.value as Prisma.InputJsonValue,
        },
      });
    }
  }
}
