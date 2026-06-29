import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDTO } from '../../../../common/dto/pagination-query.dto';

export class GetTimesheetProjectsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ example: 'WO-001', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
