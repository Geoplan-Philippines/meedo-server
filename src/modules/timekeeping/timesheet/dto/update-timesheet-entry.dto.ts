import { PartialType } from '@nestjs/swagger';

import { CreateTimesheetEntryDTO } from './create-timesheet-entry.dto';

export class UpdateTimesheetEntryDTO extends PartialType(CreateTimesheetEntryDTO) {}
