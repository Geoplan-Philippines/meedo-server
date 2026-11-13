import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { ListQueryDTO } from '../../../../common/dto/list-query.dto';

/** Search matches member name and email. */
export class GetProjectMemberOptionsQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ description: 'Leave out users who are already members of this project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
