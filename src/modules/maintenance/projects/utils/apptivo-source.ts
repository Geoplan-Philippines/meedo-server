/** Legacy seed identifiers predate nullable source IDs. Never reconcile those rows. */
export const APPTIVO_SOURCE_FILTER = {
  NOT: [
    { apptivoId: { startsWith: 'seed-' } },
    { apptivoId: { startsWith: 'local-timesheet-' } },
  ],
};
export const isApptivoSource = (id: string | null | undefined): id is string =>
  !!id && !id.startsWith('seed-') && !id.startsWith('local-timesheet-');
