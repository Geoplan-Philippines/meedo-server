import { Logger } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';

import { diagnoseUnauthorized, formatUnauthorizedDiagnosis } from './session-diagnostics';

/** Error codes better-auth uses when a session lookup comes back empty or fails. */
const SESSION_ERROR_CODES = new Set(['UNAUTHORIZED', 'FAILED_TO_GET_SESSION']);

const logger = new Logger('SessionDiagnostics');

/**
 * Logs why each session 401 from a better-auth endpoint happened (missing
 * cookie, bad signature, deleted or expired session, or a failed lookup).
 * Wrong-password 401s use other codes and are left alone.
 */
export const sessionDiagnostics = (): BetterAuthPlugin => ({
  id: 'session-diagnostics',
  hooks: {
    after: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned;
          if (!isAPIError(returned) || returned.statusCode !== 401) return;
          if (!SESSION_ERROR_CODES.has(String(returned.body?.code))) return;

          const cookieName = ctx.context.authCookies.sessionToken.name;
          const diagnosis = await diagnoseUnauthorized({
            hasSessionCookie: Boolean(ctx.getCookie(cookieName)),
            readSignedToken: async () => (await ctx.getSignedCookie(cookieName, ctx.context.secret)) || null,
            findSession: (token) => ctx.context.internalAdapter.findSession(token),
          });

          const request = `${ctx.request?.method ?? ctx.method ?? 'GET'} ${ctx.path}`;
          const line = formatUnauthorizedDiagnosis(request, diagnosis);
          if (diagnosis.error instanceof Error) logger.error(line, diagnosis.error.stack);
          else logger.warn(line);
        }),
      },
    ],
  },
});
