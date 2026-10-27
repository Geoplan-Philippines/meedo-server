import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

/** Sidebar tree: one page of active clients, optionally narrowed by name and Dept (team). */
export class GetClientTreeQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ default: false, description: 'Only clients with at least one active project' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasActiveProjects?: boolean;

  @ApiPropertyOptional({ maxLength: 100, description: 'Case-insensitive match on display or customer name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Dept (team): only clients with an active project that has a non-archived ticket for this team. Tickets are the only team link.',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
