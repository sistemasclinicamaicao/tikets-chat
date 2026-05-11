import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserPayload } from './jwt-user.payload';

export type AuthUser = UserPayload;

/** @deprecated Use `UserPayload` / `sub` instead of `userId` */
export type LegacyAuthUser = UserPayload & { userId: string };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): UserPayload => {
  const request = ctx.switchToHttp().getRequest<{ user: UserPayload }>();
  return request.user;
});
