import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

import { CreateTicketDTO } from './create-ticket.dto';

export class UpdateTicketDTO extends PartialType(CreateTicketDTO) {
  // Full replacement set of linked ticket IDs (like `assigneeIds`). Relations are
  // symmetric, so the server mirrors each link on the other ticket.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  relatedTicketIds?: string[];
}
