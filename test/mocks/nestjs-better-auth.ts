import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

export type UserSession = {
  user?: { id?: string; [key: string]: unknown };
  session?: Record<string, unknown>;
};

export const AllowAnonymous = () => SetMetadata('allowAnonymous', true);
export const OrgRoles = (...roles: string[]) => SetMetadata('orgRoles', roles);
export const Session = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().session;
});

export class AuthModule {
  static forRoot(..._args: unknown[]) {
    return { module: AuthModule };
  }
}
