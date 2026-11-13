/**
 * Works out why a request that needed a session got a 401.
 *
 * better-auth's session middleware turns every failed session lookup into the
 * same `{"code":"UNAUTHORIZED"}` 401, whether the cookie was missing or the
 * database threw. This module re-checks the request step by step so the API
 * log says which one it was. It never sees or logs the session token itself.
 */

export type UnauthorizedReason =
  | 'no-session-cookie'
  | 'invalid-cookie-signature'
  | 'session-not-found'
  | 'session-expired'
  | 'session-lookup-failed'
  | 'session-valid-on-recheck';

export interface DiagnosedSession {
  session: { id: string; userId: string; expiresAt: Date };
}

/** Read-only views of the request and session store the diagnosis needs. */
export interface SessionProbe {
  /** Whether the request carried a session cookie at all, signed or not. */
  hasSessionCookie: boolean;
  /** The session token when the cookie's signature checks out, otherwise null. */
  readSignedToken: () => Promise<string | null>;
  findSession: (token: string) => Promise<DiagnosedSession | null>;
  now?: Date;
}

export interface UnauthorizedDiagnosis {
  reason: UnauthorizedReason;
  explanation: string;
  sessionId?: string;
  userId?: string;
  error?: unknown;
}

export async function diagnoseUnauthorized(probe: SessionProbe): Promise<UnauthorizedDiagnosis> {
  if (!probe.hasSessionCookie) {
    return {
      reason: 'no-session-cookie',
      explanation: 'The request had no session cookie, so the browser did not send one (blocked, expired or cleared).',
    };
  }

  try {
    const token = await probe.readSignedToken();
    if (!token) {
      return {
        reason: 'invalid-cookie-signature',
        explanation:
          'The session cookie signature did not verify. BETTER_AUTH_SECRET may differ between API instances, or the cookie was altered.',
      };
    }

    const found = await probe.findSession(token);
    if (!found) {
      return {
        reason: 'session-not-found',
        explanation: 'No session matches the cookie. It was signed out or deleted, for example by another tab.',
      };
    }

    const { id: sessionId, userId, expiresAt } = found.session;
    if (expiresAt.getTime() <= (probe.now ?? new Date()).getTime()) {
      return {
        reason: 'session-expired',
        explanation: `The session expired at ${expiresAt.toISOString()}.`,
        sessionId,
        userId,
      };
    }

    return {
      reason: 'session-valid-on-recheck',
      explanation:
        'The session is valid when checked again, so the lookup failed only during this request, ' +
        'for example a database or connection pool error. better-auth logs that error as ' +
        '"[Better Auth]: INTERNAL_SERVER_ERROR" just before this line.',
      sessionId,
      userId,
    };
  } catch (error) {
    return {
      reason: 'session-lookup-failed',
      explanation: `Looking the session up threw: ${describeError(error)}`,
      error,
    };
  }
}

/** One log line: what was requested, why it got a 401, and which session it was. */
export function formatUnauthorizedDiagnosis(request: string, diagnosis: UnauthorizedDiagnosis): string {
  const ids = [
    diagnosis.sessionId && `session=${diagnosis.sessionId}`,
    diagnosis.userId && `user=${diagnosis.userId}`,
  ].filter(Boolean);
  const suffix = ids.length ? ` (${ids.join(' ')})` : '';
  return `401 on ${request}: ${diagnosis.reason}. ${diagnosis.explanation}${suffix}`;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} [${code}] ${error.message}` : `${error.name}: ${error.message}`;
}
