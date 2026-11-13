/** Refuse an unrecognized target; production always requires an exact database-name opt-in. */
export function assertSafeSeedTarget(environment: NodeJS.ProcessEnv): void {
  let target: URL;
  try { target = new URL(environment.DATABASE_URL ?? ''); }
  catch { throw new Error('Seed requires a valid DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Seed requires PostgreSQL.');
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname);
  const explicitlyAllowed = environment.SEED_ALLOWED_DATABASE_NAME?.trim() === databaseName && !!databaseName;
  if (environment.NODE_ENV === 'production' && !explicitlyAllowed) {
    throw new Error('Production seed requires SEED_ALLOWED_DATABASE_NAME to exactly match the target database.');
  }
  if (!databaseName || (!isLocal && !explicitlyAllowed)) throw new Error('Seed target is not allowed.');
}
