import { IsUUID } from 'class-validator';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllTeamsQueryDTO extends PaginationQueryDTO {

  @IsUUID()
  organizationId!: string;

}

