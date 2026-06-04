export const DEPARTMENTS_BASE = '/departamentos';

/** Departamentos con BD Hoja de Vida en lienzo vacío (sin tabla ni subpestañas). */
export const BD_HOJA_DE_VIDA_BLANK_CANVAS_DEPARTMENT_IDS = new Set([
  'cmp09a7j10003kgf40vb5luez',
  'cmp08f1if0000kgf4k6zdddum',
]);

export type DepartmentExperienceType = 'comunicaciones-gth' | 'mantenimiento' | 'inventory';

export function isComunicacionesDepartment(name: string): boolean {
  const n = name.trim().toUpperCase();
  return n === 'COMUNICACIONES' || n.includes('COMUNICACION');
}

export function isMantenimientoDepartment(name: string): boolean {
  const n = name.trim().toUpperCase();
  return n === 'MANTENIMIENTO' || n.includes('MANTENIMIENT');
}

/** Lienzo en blanco en `/hoja-de-vida/pc/bd-hoja-de-vida` (por id configurado o nombre Mantenimiento). */
export function usesBdHojaDeVidaBlankCanvas(departmentId: string, departmentName: string): boolean {
  if (BD_HOJA_DE_VIDA_BLANK_CANVAS_DEPARTMENT_IDS.has(departmentId)) return true;
  return isMantenimientoDepartment(departmentName);
}

export function resolveDepartmentExperience(name: string): DepartmentExperienceType {
  if (isComunicacionesDepartment(name)) return 'comunicaciones-gth';
  if (isMantenimientoDepartment(name)) return 'mantenimiento';
  return 'inventory';
}

export function departmentHomePath(departmentId: string): string {
  return `${DEPARTMENTS_BASE}/${departmentId}`;
}

export function departmentAltasGthPath(departmentId: string): string {
  return `${DEPARTMENTS_BASE}/${departmentId}/altas-gth`;
}

export function departmentInventoryPcPath(departmentId: string): string {
  return `${DEPARTMENTS_BASE}/${departmentId}/hoja-de-vida/pc/bd-hoja-de-vida`;
}

export function departmentUsuariosPath(departmentId: string): string {
  return `${DEPARTMENTS_BASE}/${departmentId}/usuarios`;
}

export function departmentMantenimientosPath(departmentId: string): string {
  return `${DEPARTMENTS_BASE}/${departmentId}/mantenimientos`;
}

export function departmentDefaultPath(departmentId: string, name: string): string {
  const exp = resolveDepartmentExperience(name);
  if (exp === 'comunicaciones-gth') return departmentAltasGthPath(departmentId);
  if (exp === 'mantenimiento') return departmentInventoryPcPath(departmentId);
  return departmentInventoryPcPath(departmentId);
}

export type DepartmentCardAction = {
  label: string;
  iconClass: string;
  to: string;
  variant: 'primary' | 'cta';
};

export function departmentCardHint(name: string): string {
  if (resolveDepartmentExperience(name) === 'comunicaciones-gth') {
    return 'Personal incorporado vía GTH. Consulte altas resueltas con fotografía del ticket.';
  }
  if (resolveDepartmentExperience(name) === 'mantenimiento') {
    return 'Equipos del área: consulte la hoja de vida en BD y sincronice desde el API cuando lo necesite.';
  }
  return 'Consulte y actualice la hoja de vida de equipos asignados a esta área.';
}

export function departmentCardActions(departmentId: string, name: string): DepartmentCardAction[] {
  if (resolveDepartmentExperience(name) === 'comunicaciones-gth') {
    return [
      {
        label: 'Ver altas GTH',
        iconClass: 'ti-user-check',
        to: departmentAltasGthPath(departmentId),
        variant: 'primary',
      },
    ];
  }
  if (resolveDepartmentExperience(name) === 'mantenimiento') {
    return [
      {
        label: 'BD Hoja de vida',
        iconClass: 'ti-database',
        to: departmentInventoryPcPath(departmentId),
        variant: 'primary',
      },
    ];
  }
  return [
    {
      label: 'Abrir hoja de vida',
      iconClass: 'ti-device-desktop',
      to: departmentInventoryPcPath(departmentId),
      variant: 'primary',
    },
    {
      label: 'Mantenimientos',
      iconClass: 'ti-tools',
      to: departmentMantenimientosPath(departmentId),
      variant: 'cta',
    },
  ];
}
