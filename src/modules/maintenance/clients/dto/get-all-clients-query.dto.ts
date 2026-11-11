import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ArchivableQueryDTO } from '../../projects/dto/archivable-query.dto';

export const CLIENT_SORT_FIELDS = ['customerName', 'projectCount', 'createdAt'] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

export class GetAllClientsQueryDTO extends ArchivableQueryDTO {
  @ApiPropertyOptional({ enum: CLIENT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CLIENT_SORT_FIELDS)
  sortField?: ClientSortField;
}
