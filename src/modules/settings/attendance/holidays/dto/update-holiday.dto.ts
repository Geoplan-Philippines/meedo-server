import { PartialType } from '@nestjs/mapped-types';

import { CreateHolidayDTO } from './create-holiday.dto';

export class UpdateHolidayDTO extends PartialType(CreateHolidayDTO) {}
