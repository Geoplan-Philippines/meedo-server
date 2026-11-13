import { assertSafeSeedTarget } from './seed-target';

describe('seed target guard (dry run: never invokes seed)', () => {
  const local = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://user:placeholder@localhost:5432/meedo' };
  it('allows a local database in development', () => expect(() => assertSafeSeedTarget(local)).not.toThrow());
  it('allows the application database in production', () => expect(() => assertSafeSeedTarget({ ...local, NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432/meedo_prod' })).not.toThrow());
  it('refuses an invalid database URL', () => expect(() => assertSafeSeedTarget({ DATABASE_URL: 'not-a-url' })).toThrow('valid DATABASE_URL'));
  it('refuses a non-PostgreSQL database', () => expect(() => assertSafeSeedTarget({ DATABASE_URL: 'mysql://user:placeholder@db.example.test:3306/meedo' })).toThrow('PostgreSQL'));
  it('refuses a URL without a database name', () => expect(() => assertSafeSeedTarget({ DATABASE_URL: 'postgresql://user:placeholder@db.example.test:5432' })).toThrow('database name'));
});
