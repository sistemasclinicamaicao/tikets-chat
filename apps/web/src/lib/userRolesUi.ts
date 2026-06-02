import { formatDepartmentRoleLabel } from './api';

export function departmentRoleBadgeVariant(role: string): string {
  if (role === 'dept_admin') return 'inventory-badge--warning';
  if (role === 'supervisor') return 'inventory-badge--neutral';
  return 'inventory-badge--muted';
}

export function globalRoleBadgeVariant(role: string | null): string {
  if (role === 'admin') return 'inventory-badge--warning';
  if (role === 'auditor') return 'inventory-badge--neutral';
  return 'inventory-badge--muted';
}

export function departmentRoleLabel(role: string): string {
  return formatDepartmentRoleLabel(role);
}

export function globalRoleLabel(role: string | null): string {
  if (!role) return 'Sin rol global';
  if (role === 'admin') return 'Administrador';
  if (role === 'auditor') return 'Auditor';
  return role;
}

export type MemberStats = {
  total: number;
  deptAdmin: number;
  supervisor: number;
  tecnico: number;
};

export function computeMemberStats(members: { role: string }[]): MemberStats {
  let deptAdmin = 0;
  let supervisor = 0;
  let tecnico = 0;
  for (const m of members) {
    if (m.role === 'dept_admin') deptAdmin += 1;
    else if (m.role === 'supervisor') supervisor += 1;
    else if (m.role === 'tecnico_area') tecnico += 1;
  }
  return { total: members.length, deptAdmin, supervisor, tecnico };
}
