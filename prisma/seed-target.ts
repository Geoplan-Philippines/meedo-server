/** Refuse to seed production or an unrecognized database target. */
export function assertSafeSeedTarget(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === 'production') throw new Error('Seed is disabled in production.');
  let target: URL;
  try { target = new URL(environment.DATABASE_URL ?? ''); }
  catch { throw new Error('Seed requires a valid DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Seed requires PostgreSQL.');
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname);
  const explicitlyAllowed = environment.SEED_ALLOWED_DATABASE_NAME?.trim() === databaseName && !!databaseName;
  if (!databaseName || (!isLocal && !explicitlyAllowed)) throw new Error('Seed target is not allowed.');
}
