import { PartialType } from '@nestjs/mapped-types';
import { CreateStatusDTO } from './create-status.dto';

export class UpdateStatusDTO extends PartialType (CreateStatusDTO) {}
