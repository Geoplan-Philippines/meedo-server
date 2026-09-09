import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectState, TicketPriority } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_KEY_PATTERN,
  PROJECT_NAME_MAX_LENGTH,
} from '../constants/project.constants';

export class CreateProjectDTO {
  @ApiProperty({ example: 'Field Operations', maxLength: PROJECT_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({
    description: 'Ticket key prefix. Derived from the name when omitted.',
    example: 'FO',
  })
  @IsOptional()
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, {
    message: 'key must be 2-6 characters, start with a letter, and use only A-Z and 0-9.',
  })
  key?: string;

  @ApiPropertyOptional({ maxLength: PROJECT_DESCRIPTION_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ enum: ProjectState, default: ProjectState.BACKLOG })
  @IsOptional()
  @IsEnum(ProjectState)
  state?: ProjectState;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ description: 'Member who leads the project' })
  @IsOptional()
  @IsUUID()
  leadMemberId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Members assigned to the project' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({ description: 'Apptivo work order this project delivers against' })
  @IsOptional()
  @IsUUID()
  workOrderId?: string;
}
