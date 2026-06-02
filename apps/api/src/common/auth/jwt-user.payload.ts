export type DepartmentRoleEntry = {
  departmentId: string;
  role: string;
};

/** Claims stored in JWT access/refresh tokens (extended after enterprise RBAC). */
export type JwtUserPayload = {
  sub: string;
  employee_id: string;
  name: string;
  global_role: string | null;
  department_roles: DepartmentRoleEntry[];
};

/** Normalized user attached to `request.user` after JwtStrategy (includes `userId` alias of `sub`). */
export type UserPayload = JwtUserPayload & { userId: string };

export const GLOBAL_ROLES = {
  ADMIN: 'admin',
  AUDITOR: 'auditor',
} as const;

export const DEPARTMENT_ROLES = {
  DEPT_ADMIN: 'dept_admin',
  SUPERVISOR: 'supervisor',
  TECNICO_AREA: 'tecnico_area',
} as const;
