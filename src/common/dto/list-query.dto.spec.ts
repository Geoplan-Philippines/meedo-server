import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ListQueryDTO } from './list-query.dto';
import { GetAllLeadsQueryDTO } from '../../modules/crm/leads/dto/get-all-leads-query.dto';
import { GetMembersQueryDTO } from '../../modules/settings/members/dto/get-members-query.dto';
import { GetTeamsQueryDTO } from '../../modules/settings/teams/dto/get-teams-query.dto';
import { GetStatusesQueryDTO } from '../../modules/settings/statuses/dto/get-statuses-query.dto';
import { GetTimesheetSummaryPageQueryDTO } from '../../modules/timekeeping/timesheet/dto/get-timesheet-summary-page-query.dto';

type Ctor<T> = new () => T;
const parse = <T extends object>(type: Ctor<T>, query: Record<string, unknown>) => {
  const dto = plainToInstance(type, query);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
};

describe('shared list query', () => {
  it('defaults to page 1 of 10 and parses query strings', () => {
    expect(parse(ListQueryDTO, {}).dto).toMatchObject({ page: 1, limit: 10 });
    const { dto, errors } = parse(ListQueryDTO, { page: '3', limit: '25', sortOrder: 'desc' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 3, limit: 25, sortOrder: 'desc' });
  });

  it('trims the search and treats a blank one as no search', () => {
    expect(parse(ListQueryDTO, { search: '  acme  ' }).dto.search).toBe('acme');
    expect(parse(ListQueryDTO, { search: '   ' }).dto.search).toBeUndefined();
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ limit: '51' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
    [{ search: 'x'.repeat(101) }, 'search'],
  ])('rejects %o', (query, property) => {
    expect(parse(ListQueryDTO, query).errors.map((error) => error.property)).toContain(property);
  });

  it('only accepts whitelisted sort fields per endpoint', () => {
    expect(parse(GetAllLeadsQueryDTO, { sortField: 'email' }).errors).toHaveLength(0);
    expect(parse(GetAllLeadsQueryDTO, { sortField: 'message' }).errors.map((e) => e.property)).toContain('sortField');
    expect(parse(GetMembersQueryDTO, { sortField: 'password' }).errors.map((e) => e.property)).toContain('sortField');
    expect(parse(GetTeamsQueryDTO, { sortField: 'memberCount', mine: 'true' }).dto).toMatchObject({ sortField: 'memberCount', mine: true });
  });

  it('parses list filters from query strings', () => {
    expect(parse(GetStatusesQueryDTO, { isSystem: 'false', includeArchived: 'false' }).dto).toMatchObject({
      isSystem: false,
      includeArchived: false,
    });
    const summary = parse(GetTimesheetSummaryPageQueryDTO, {
      periodStart: '2026-06-22', periodEnd: '2026-06-28', page: '2', limit: '25', tab: 'SUBMITTED', search: ' ops ',
    });
    expect(summary.errors).toHaveLength(0);
    expect(summary.dto).toMatchObject({ page: 2, limit: 25, tab: 'SUBMITTED', search: 'ops' });
    expect(parse(GetTimesheetSummaryPageQueryDTO, { periodStart: '2026-06-22', periodEnd: '2026-06-28', tab: 'LOST' }).errors).not.toHaveLength(0);
  });
});
