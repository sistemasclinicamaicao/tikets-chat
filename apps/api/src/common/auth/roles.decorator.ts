import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Role names allowed by JwtUserPayload / RBAC (global or department roles checked in guard). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
