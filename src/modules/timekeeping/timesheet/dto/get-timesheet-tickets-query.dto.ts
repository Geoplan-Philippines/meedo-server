import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDTO } from '../../../../common/dto/pagination-query.dto';

export class GetTimesheetTicketsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}
