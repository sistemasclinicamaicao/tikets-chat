import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUserPayload, UserPayload } from '../../../common/auth/jwt-user.payload';
import { getJwtSecrets } from '../../../common/runtime/production-security';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const { accessSecret } = getJwtSecrets();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  validate(payload: JwtUserPayload & { department_roles?: unknown; global_role?: unknown }): UserPayload {
    const department_roles = Array.isArray(payload.department_roles)
      ? (payload.department_roles as { departmentId: string; role: string }[])
      : [];
    return {
      sub: payload.sub,
      employee_id: payload.employee_id,
      name: payload.name,
      global_role: (payload.global_role as string | null | undefined) ?? null,
      department_roles,
      userId: payload.sub,
    };
  }
}
