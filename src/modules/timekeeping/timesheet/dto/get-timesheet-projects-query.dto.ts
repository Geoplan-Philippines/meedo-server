import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDTO } from '../../../../common/dto/pagination-query.dto';

export class GetTimesheetProjectsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ example: 'WO-001', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Include archived projects (for filters over existing entries); new entries cannot use them',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
