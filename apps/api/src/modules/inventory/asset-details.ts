import { BadRequestException } from '@nestjs/common';
import { EquipmentCategory } from '@prisma/client';

const PC_KEYS = new Set([
  'dir_ip',
  'dependency_id',
  'dependency_name',
  'usuario',
  'fecha_adquisicion',
  'marca',
  'modelo',
  'procesador',
  'tp_almacenamiento',
  'tam_disco',
  'tarjeta_grafica',
  'fecha_instalacion',
  'tp_ram',
  'ram',
  'monitor',
  'sis_operativo',
  'vers_sistema',
  'desc_programa',
  'remoto',
  'estado_actual',
  'motivo_inactividad',
  'resp_equipo',
  'comentario',
  'licencia_of',
  'fecha_instalacion_lic',
  'image_url',
  'mac',
  'legacy_id',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function normalizeDetailsInput(
  category: EquipmentCategory,
  raw: unknown,
): Record<string, unknown> {
  if (raw == null || raw === '') return {};
  if (!isPlainObject(raw)) {
    throw new BadRequestException('El campo detalles debe ser un objeto JSON');
  }
  const allowed =
    category === EquipmentCategory.pc
      ? PC_KEYS
      : category === EquipmentCategory.printer
        ? new Set([
            'ubicacion',
            'ip',
            'usb',
            'contador_paginas',
            'estado',
            'responsable',
            'comentario',
            'marca',
            'modelo',
          ])
        : category === EquipmentCategory.network
          ? new Set([
              'tipo',
              'ubicacion',
              'ip_gestion',
              'puertos',
              'firmware',
              'estado',
              'responsable',
              'comentario',
              'marca',
              'modelo',
              'mac',
            ])
          : new Set([
              'tipo_libre',
              'ubicacion',
              'estado',
              'responsable',
              'comentario',
              'marca',
              'modelo',
            ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.has(k)) {
      throw new BadRequestException(`Campo no permitido en detalles: ${k}`);
    }
    if (v === undefined) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    throw new BadRequestException(`Tipo no válido en detalles.${k}`);
  }
  return out;
}

export function mergeDetails(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...patch };
}
