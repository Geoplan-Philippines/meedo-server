import { assertSafeSeedTarget } from './seed-target';

describe('seed target guard (dry run: never invokes seed)', () => {
  const local = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://user:placeholder@localhost:5432/meedo' };
  it('allows a local database in development', () => expect(() => assertSafeSeedTarget(local)).not.toThrow());
  it('refuses production even for localhost', () => expect(() => assertSafeSeedTarget({ ...local, NODE_ENV: 'production' })).toThrow('production'));
  it('refuses a remote database without an explicit name', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/meedo' })).toThrow('not allowed'));
  it('permits an explicitly named remote development database', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/example_seed', SEED_ALLOWED_DATABASE_NAME: 'example_seed' })).not.toThrow());
  it('refuses a different database name', () => expect(() => assertSafeSeedTarget({ ...local, DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/other', SEED_ALLOWED_DATABASE_NAME: 'example_seed' })).toThrow('not allowed'));
});
