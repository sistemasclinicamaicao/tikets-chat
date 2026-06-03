export const DEPARTMENTS_BASE = '/departamentos';

export type DepartmentExperienceType = 'comunicaciones-gth' | 'inventory';

export function isComunicacionesDepartment(name: string): boolean {
  const n = name.trim().toUpperCase();
  return n === 'COMUNICACIONES' || n.includes('COMUNICACION');
}

export function resolveDepartmentExperience(name: string): DepartmentExperienceType {
  return isComunicacionesDepartment(name) ? 'comunicaciones-gth' : 'inventory';
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
  return resolveDepartmentExperience(name) === 'comunicaciones-gth'
    ? departmentAltasGthPath(departmentId)
    : departmentInventoryPcPath(departmentId);
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
