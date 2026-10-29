/**
 * Minimal in-memory stand-in for the Prisma calls made by the Apptivo client/project sync.
 *
 * - `$transaction(fn)` snapshots state and restores it if `fn` throws, so tests can assert
 *   that a mid-sync failure leaves no partial writes.
 * - Unique keys mirror the schema: (organizationId, apptivoId) on clients and projects.
 * - Any delete throws, and timesheet entries are modelled as references to project ids so
 *   tests can check that referenced projects survive (onDelete: Restrict in the real schema).
 */

type Row = Record<string, unknown> & { id: string; organizationId: string; apptivoId: string | null };

type Where = Record<string, unknown>;

type FilterOperator = { in?: unknown[]; notIn?: unknown[]; not?: unknown; startsWith?: string };

const isFilterOperator = (value: unknown): value is FilterOperator =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && ('in' in value || 'notIn' in value || 'not' in value || 'startsWith' in value);

const matches = (row: Row, where: Where = {}): boolean =>
  Object.entries(where).every(([key, expected]) => {
    if (key === 'NOT') return !(expected as Where[]).some(filter => matches(row, filter));
    if (key === 'organizationId_apptivoId') {
      const compound = expected as { organizationId: string; apptivoId: string };
      return row.organizationId === compound.organizationId && row.apptivoId === compound.apptivoId;
    }
    if (isFilterOperator(expected)) {
      if (expected.startsWith !== undefined && (typeof row[key] !== 'string' || !row[key].startsWith(expected.startsWith))) return false;
      if ('not' in expected && row[key] === expected.not) return false;
      if (expected.in && !expected.in.includes(row[key])) return false;
      if (expected.notIn && expected.notIn.includes(row[key])) return false;
      return true;
    }
    return row[key] === expected;
  });

const cloneRow = (row: Row): Row => ({ ...row });

class FakeTable {
  rows: Row[] = [];
  private sequence = 0;

  constructor(
    private readonly prefix: string,
    private readonly onDelete: () => never,
    /** Column defaults from the schema, applied on insert. */
    private readonly defaults: Record<string, unknown> = {},
  ) {}

  seed(rows: Array<Partial<Row> & { organizationId: string; apptivoId: string | null }>): Row[] {
    return rows.map((row) => this.insert(row));
  }

  findMany = jest.fn(({ where }: { where?: Where } = {}) =>
    Promise.resolve(this.rows.filter((r) => matches(r, where)).map(cloneRow)),
  );

  createMany = jest.fn(({ data }: { data: Array<Partial<Row>> }) => {
    try {
      data.forEach((row) => this.insert(row as Row));
      return Promise.resolve({ count: data.length });
    } catch (error) {
      return Promise.reject(error as Error);
    }
  });

  update = jest.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) return Promise.reject(new Error(`${this.prefix}: record to update not found`));
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(cloneRow(row));
  });

  updateMany = jest.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
    const targets = this.rows.filter((r) => matches(r, where));
    targets.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));
    return Promise.resolve({ count: targets.length });
  });

  delete = jest.fn(() => this.onDelete());
  deleteMany = jest.fn(() => this.onDelete());

  private insert(row: Partial<Row> & { organizationId: string; apptivoId: string | null }): Row {
    if (row.apptivoId !== null && this.rows.some((r) => r.organizationId === row.organizationId && r.apptivoId === row.apptivoId)) {
      throw new Error(`${this.prefix}: unique constraint failed on (organizationId, apptivoId)`);
    }
    const now = new Date();
    const stored: Row = {
      id: `${this.prefix}-${++this.sequence}`,
      isArchived: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...this.defaults,
      ...row,
    };
    this.rows.push(stored);
    return cloneRow(stored);
  }
}

export class FakeApptivoSyncPrisma {
  readonly client = new FakeTable(
    'client',
    () => {
      throw new Error('Delete called on clients during sync');
    },
    { displayName: null },
  );

  readonly project = new FakeTable(
    'project',
    () => {
      throw new Error('Delete called on projects during sync');
    },
    { customerName: '', quoteSubject: null, apptivoQuoteRefId: null, displayName: null, clientLocked: false, archivedManually: false, isClosed: false },
  );

  /** project ids referenced by timesheet entries (onDelete: Restrict in the real schema). */
  readonly timesheetProjectIds = new Set<string>();

  $transaction = jest.fn(async <T>(fn: (tx: this) => Promise<T>): Promise<T> => {
    const snapshot = { clients: this.client.rows.map(cloneRow), projects: this.project.rows.map(cloneRow) };
    try {
      return await fn(this);
    } catch (error) {
      this.client.rows = snapshot.clients;
      this.project.rows = snapshot.projects;
      throw error;
    }
  });

  clientByApptivoId(organizationId: string, apptivoId: string): Row | undefined {
    return this.client.rows.find((r) => r.organizationId === organizationId && r.apptivoId === apptivoId);
  }

  projectByApptivoId(organizationId: string, apptivoId: string): Row | undefined {
    return this.project.rows.find((r) => r.organizationId === organizationId && r.apptivoId === apptivoId);
  }
}
