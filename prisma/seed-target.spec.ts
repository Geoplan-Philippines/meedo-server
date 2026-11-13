import { assertSafeSeedTarget } from './seed-target';

describe('seed target guard (dry run: never invokes seed)', () => {
  const local = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://user:placeholder@localhost:5432/meedo' };
  it('allows a local database in development', () => expect(() => assertSafeSeedTarget(local)).not.toThrow());
  it('refuses production without an exact database-name opt-in', () => expect(() => assertSafeSeedTarget({ ...local, NODE_ENV: 'production' })).toThrow('Production'));
  it('permits an explicitly named production database', () => expect(() => assertSafeSeedTarget({ ...local, NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/meedo_prod', SEED_ALLOWED_DATABASE_NAME: 'meedo_prod' })).not.toThrow());
  it('refuses a remote database without an explicit name', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/meedo' })).toThrow('not allowed'));
  it('permits an explicitly named remote development database', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/example_seed', SEED_ALLOWED_DATABASE_NAME: 'example_seed' })).not.toThrow());
  it('refuses a different database name', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/other', SEED_ALLOWED_DATABASE_NAME: 'example_seed' })).toThrow('not allowed'));
});
