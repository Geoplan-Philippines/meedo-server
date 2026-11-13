import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO } from '../../../../common/dto/list-query.dto';
import { GetTimesheetSummaryQueryDTO } from './get-timesheet-summary-query.dto';

/**
 * Approval tabs, per employee: SUBMITTED has an entry waiting, REJECTED has a
 * returned entry, APPROVED has every entry approved.
 */
export const TIMESHEET_SUMMARY_TABS = ['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type TimesheetSummaryTab = (typeof TIMESHEET_SUMMARY_TABS)[number];

/**
 * One page of employees for the approval screen. Search matches employee
 * name, email and team (department) name; employees are ordered by name.
 */
export class GetTimesheetSummaryPageQueryDTO extends IntersectionType(GetTimesheetSummaryQueryDTO, ListQueryDTO) {
  @ApiPropertyOptional({ enum: TIMESHEET_SUMMARY_TABS, default: 'ALL' })
  @IsOptional()
  @IsIn(TIMESHEET_SUMMARY_TABS)
  tab?: TimesheetSummaryTab;
}
