import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

function collectMessages(errors: ValidationError[], prefix = ''): string[] {
  const out: string[] = [];
  for (const e of errors) {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) {
      for (const msg of Object.values(e.constraints)) {
        out.push(translateConstraint(path, msg));
      }
    }
    if (e.children?.length) {
      out.push(...collectMessages(e.children, path));
    }
  }
  return out;
}

/** Traduce mensajes típicos de class-validator al español (por patrón). */
function translateConstraint(property: string, english: string): string {
  const p = property.includes('.') ? property.split('.').pop() ?? property : property;
  const label = fieldLabelEs(p);

  if (english.includes('must be a UUID')) {
    return `${label}: identificador no válido (se esperaba UUID).`;
  }
  if (english.includes('must be an UUID')) {
    return `${label}: identificador no válido (se esperaba UUID).`;
  }
  if (english.includes('should not be empty') || english.includes('must not be empty')) {
    return `${label}: no puede estar vacío.`;
  }
  if (english.includes('must be a string')) {
    return `${label}: debe ser texto.`;
  }
  if (english.includes('must be shorter than or equal to')) {
    const m = english.match(/(\d+)/);
    const n = m ? m[1] : '';
    return `${label}: como máximo ${n} caracteres.`;
  }
  if (english.includes('must be longer than or equal to')) {
    const m = english.match(/(\d+)/);
    const n = m ? m[1] : '';
    if (english.includes('character')) {
      return `${label}: al menos ${n} caracteres.`;
    }
    return `${label}: al menos ${n}.`;
  }
  if (english.includes('must be a number')) {
    return `${label}: debe ser un número.`;
  }
  if (english.includes('must be a boolean')) {
    return `${label}: debe ser verdadero o falso.`;
  }
  if (english.includes('is required') || english.includes('should not be null')) {
    return `${label}: es obligatorio.`;
  }

  return `${label}: ${english}`;
}

function fieldLabelEs(property: string): string {
  const map: Record<string, string> = {
    departmentId: 'Departamento',
    templateId: 'Plantilla',
    assetId: 'Activo',
    priorityId: 'Prioridad',
    subject: 'Asunto',
    description: 'Descripción',
    templateFieldId: 'Campo de plantilla',
    toStatusCode: 'Estado',
    assignedTo: 'Asignado a',
  };
  return map[property] ?? property;
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = collectMessages(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: messages.length === 1 ? messages[0] : messages,
  });
}
