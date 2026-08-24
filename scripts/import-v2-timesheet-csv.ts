import { TimesheetAuditAction, TimesheetEntryStatus, TimesheetWorkType } from '@prisma/client';

import { prisma } from '../src/core/database/prisma.client';

type CsvRow = Record<string, string>;

interface ImportOptions {
  file: string;
  organization: string;
  user: string;
  year: number;
  apply: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(await BunOrNodeFileRead(options.file));

  const organization = await prisma.organization.findFirst({
    where: { OR: [{ id: options.organization }, { slug: options.organization }] },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) throw new Error(`Organization not found: ${options.organization}`);

  const user = await prisma.user.findUnique({
    where: { email: options.user },
    select: { id: true, email: true, name: true },
  });

  if (!user) throw new Error(`User not found: ${options.user}`);

  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    select: { id: true },
  });

  if (!member) throw new Error(`${user.email} is not a member of ${organization.slug}`);

  const projects = await prisma.project.findMany({
    where: { organizationId: organization.id },
    select: { id: true, workOrderNumber: true, client: { select: { customerName: true } } },
  });

  const ready: Array<{
    row: CsvRow;
    data: Parameters<typeof prisma.timesheetEntry.create>[0]['data'];
  }> = [];
  const skipped: Array<{ rowNumber: number; reason: string; row: CsvRow }> = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    try {
      const date = parseLegacyDate(required(row, 'Date'), options.year);
      const hours = Number(required(row, 'Actual Hours'));
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        throw new Error('Actual Hours must be a number from 0 to 24');
      }

      const projectLabel = required(row, 'Project');
      const project = findProject(projects, projectLabel, row['Tag/work order'] || row['Tag'] || row['Work Order'] || '');
      if (!project) throw new Error(`No matching v3 project for legacy Project "${projectLabel}"`);

      ready.push({
        row,
        data: {
          organizationId: organization.id,
          userId: user.id,
          projectId: project.id,
          workDate: date,
          hours,
          location: row['Location']?.trim() || 'OFC - DW',
          workType: workTypeFromLocation(row['Location']),
          task: required(row, 'Task'),
          projectDescription: row['Project Description']?.trim() || null,
          isOvertime: truthy(row['OT']),
          isNightDifferential: truthy(row['ND']),
          status: truthy(row['✓']) ? TimesheetEntryStatus.APPROVED : TimesheetEntryStatus.SUBMITTED,
          submittedAt: new Date(),
          approvedAt: truthy(row['✓']) ? new Date() : null,
        },
      });
    } catch (error) {
      skipped.push({ rowNumber, reason: error instanceof Error ? error.message : String(error), row });
    }
  });

  console.log(`Organization: ${organization.name} (${organization.slug})`);
  console.log(`User: ${user.email}`);
  console.log(`Rows ready: ${ready.length}`);
  console.log(`Rows skipped: ${skipped.length}`);

  skipped.slice(0, 20).forEach((item) => {
    console.warn(`Skipped row ${item.rowNumber}: ${item.reason}`);
  });

  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to create entries.');
    return;
  }

  for (const item of ready) {
    const entry = await prisma.timesheetEntry.create({ data: item.data });
    await prisma.timesheetAuditLog.create({
      data: {
        organizationId: organization.id,
        targetUserId: user.id,
        timesheetEntryId: entry.id,
        action: TimesheetAuditAction.CREATED,
        after: item.data as never,
      },
    });
  }

  console.log(`Imported ${ready.length} v2 rows.`);
}

async function BunOrNodeFileRead(path: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(path, 'utf8');
}

function parseArgs(args: string[]): ImportOptions {
  const options: Partial<ImportOptions> = { apply: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    const value = args[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);

    if (arg === '--file') options.file = value;
    if (arg === '--organization') options.organization = value;
    if (arg === '--user') options.user = value;
    if (arg === '--year') options.year = Number(value);
    index += 1;
  }

  if (!options.file || !options.organization || !options.user || !options.year) {
    throw new Error('Usage: ts-node scripts/import-v2-timesheet-csv.ts --file <csv> --organization <slug-or-id> --user <email> --year <yyyy> [--apply]');
  }

  return options as ImportOptions;
}

function parseCsv(input: string): CsvRow[] {
  const records: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) records.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) records.push(row);

  const [headers = [], ...dataRows] = records;
  return dataRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function required(row: CsvRow, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parseLegacyDate(value: string, year: number): Date {
  const match = value.trim().match(/^([A-Za-z]{3,})[-/\s](\d{1,2})$/);
  if (!match) throw new Error(`Unsupported Date format "${value}"`);

  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  const day = Number(match[2]);
  if (month === undefined || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Invalid Date value "${value}"`);
  }

  return new Date(Date.UTC(year, month, day));
}

function findProject(
  projects: Array<{ id: string; workOrderNumber: string; client: { customerName: string } | null }>,
  projectLabel: string,
  tagLabel: string,
) {
  const normalizedProject = normalize(projectLabel);
  const normalizedTag = normalize(tagLabel);

  const name = (p: { client: { customerName: string } | null }) => p.client?.customerName ?? '';

  return projects.find((project) => normalize(project.workOrderNumber) === normalizedTag)
    ?? projects.find((project) => normalize(project.workOrderNumber) === normalizedProject)
    ?? projects.find((project) => normalize(name(project)) === normalizedProject)
    ?? projects.find((project) => normalize(name(project)).includes(normalizedProject));
}

function workTypeFromLocation(location?: string): TimesheetWorkType {
  const value = normalize(location ?? '');
  if (value.includes('leave')) return TimesheetWorkType.LEAVE;
  if (value.includes('offset')) return TimesheetWorkType.OFFSET;
  return TimesheetWorkType.REGULAR;
}

function truthy(value?: string): boolean {
  return ['1', 'true', 'yes', 'y', '✓', 'x'].includes((value ?? '').trim().toLowerCase());
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
