/** Validate that the application's configured database is a named PostgreSQL database. */
export function assertSafeSeedTarget(environment: NodeJS.ProcessEnv): void {
  let target: URL;
  try { target = new URL(environment.DATABASE_URL ?? ''); }
  catch { throw new Error('Seed requires a valid DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Seed requires PostgreSQL.');
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (!databaseName) throw new Error('Seed requires DATABASE_URL to include a database name.');
}
