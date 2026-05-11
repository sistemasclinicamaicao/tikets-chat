import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUserPayload, UserPayload } from '../../../common/auth/jwt-user.payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev_jwt_secret',
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
