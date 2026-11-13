import { diagnoseUnauthorized, formatUnauthorizedDiagnosis, SessionProbe } from './session-diagnostics';

const NOW = new Date('2026-11-13T08:00:00.000Z');
const TOKEN = 'signed-token';

function probe(overrides: Partial<SessionProbe> = {}): SessionProbe {
  return {
    hasSessionCookie: true,
    readSignedToken: jest.fn().mockResolvedValue(TOKEN),
    findSession: jest.fn().mockResolvedValue({
      session: { id: 'session-1', userId: 'user-1', expiresAt: new Date('2026-11-20T00:00:00.000Z') },
    }),
    now: NOW,
    ...overrides,
  };
}

describe('diagnoseUnauthorized', () => {
  it('reports a missing cookie without touching the session store', async () => {
    const input = probe({ hasSessionCookie: false });

    const diagnosis = await diagnoseUnauthorized(input);

    expect(diagnosis.reason).toBe('no-session-cookie');
    expect(input.readSignedToken).not.toHaveBeenCalled();
    expect(input.findSession).not.toHaveBeenCalled();
  });

  it('reports a cookie whose signature does not verify', async () => {
    const input = probe({ readSignedToken: jest.fn().mockResolvedValue(null) });

    const diagnosis = await diagnoseUnauthorized(input);

    expect(diagnosis.reason).toBe('invalid-cookie-signature');
    expect(input.findSession).not.toHaveBeenCalled();
  });

  it('reports a session that no longer exists', async () => {
    const diagnosis = await diagnoseUnauthorized(probe({ findSession: jest.fn().mockResolvedValue(null) }));

    expect(diagnosis.reason).toBe('session-not-found');
  });

  it('reports an expired session with its ids', async () => {
    const expiresAt = new Date('2026-11-12T00:00:00.000Z');
    const diagnosis = await diagnoseUnauthorized(
      probe({ findSession: jest.fn().mockResolvedValue({ session: { id: 'session-1', userId: 'user-1', expiresAt } }) }),
    );

    expect(diagnosis).toMatchObject({ reason: 'session-expired', sessionId: 'session-1', userId: 'user-1' });
    expect(diagnosis.explanation).toContain(expiresAt.toISOString());
  });

  it('flags a session that is valid on re-check as a failed lookup during the request', async () => {
    const input = probe();

    const diagnosis = await diagnoseUnauthorized(input);

    expect(diagnosis).toMatchObject({ reason: 'session-valid-on-recheck', sessionId: 'session-1', userId: 'user-1' });
    expect(input.findSession).toHaveBeenCalledWith(TOKEN);
  });

  it('keeps the error when the re-check itself fails', async () => {
    const error = Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' });

    const diagnosis = await diagnoseUnauthorized(probe({ findSession: jest.fn().mockRejectedValue(error) }));

    expect(diagnosis.reason).toBe('session-lookup-failed');
    expect(diagnosis.error).toBe(error);
    expect(diagnosis.explanation).toContain('[ECONNRESET] Connection terminated unexpectedly');
  });
});

describe('formatUnauthorizedDiagnosis', () => {
  it('names the request, the reason and the session ids but never the token', async () => {
    const diagnosis = await diagnoseUnauthorized(probe());

    const line = formatUnauthorizedDiagnosis('GET /organization/list-members', diagnosis);

    expect(line).toMatch(/^401 on GET \/organization\/list-members: session-valid-on-recheck\. /);
    expect(line).toContain('(session=session-1 user=user-1)');
    expect(line).not.toContain(TOKEN);
  });
});
