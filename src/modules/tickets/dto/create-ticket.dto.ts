import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsArray,
  MaxLength,
} from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { TICKET_DESCRIPTION_MAX_LENGTH, TICKET_TITLE_MAX_LENGTH } from '../constants/ticket.constants';

export class CreateTicketDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TICKET_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TICKET_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  ticketStatusId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Required: every ticket lives in a project. Work with no client belongs in
  // the organization's internal project.
  @IsUUID()
  projectId!: string;

  // Optional Apptivo work order, for client/billing context.
  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];
}