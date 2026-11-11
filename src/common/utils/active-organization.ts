import { ForbiddenException } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';

/** Active organization of an authenticated session; 403 when none is selected. */
export function getActiveOrganizationId(session: UserSession): string {
  const { activeOrganizationId } = session.session;
  if (!activeOrganizationId) {
    throw new ForbiddenException('No active organization selected');
  }
  return activeOrganizationId;
}
