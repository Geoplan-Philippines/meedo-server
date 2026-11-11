/**
 * The whole sync (client + project reconciliation) runs in one interactive
 * transaction with one write per changed row, which can exceed Prisma's 5s
 * default on a large first import. Apptivo is fetched before the transaction
 * opens, so this budget only covers database work.
 */
export const APPTIVO_SYNC_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const;

export const UNARCHIVE_DATA = { isArchived: false, archivedAt: null } as const;

export const archiveData = () => ({ isArchived: true, archivedAt: new Date() });
