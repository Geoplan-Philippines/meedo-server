import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

export const CurrentOrganizationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const organizationId = request.session?.session?.activeOrganizationId;

    if (!organizationId) {
      throw new ForbiddenException('No active organization selected.');
    }

    return organizationId;
  },
);