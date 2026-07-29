import { PartialType } from '@nestjs/mapped-types';

import { CreateShiftDTO } from './create-shift.dto';

export class UpdateShiftDTO extends PartialType(CreateShiftDTO) {}
