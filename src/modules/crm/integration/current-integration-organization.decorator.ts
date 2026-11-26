import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CurrentIntegrationOrganization = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const organization = ctx.switchToHttp().getRequest().integrationOrganization;
    if (!organization) {
      throw new UnauthorizedException('Invalid integration key.');
    }
    return data ? organization[data] : organization;
  },
);
