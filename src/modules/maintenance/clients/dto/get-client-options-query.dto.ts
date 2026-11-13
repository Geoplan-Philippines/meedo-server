import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { ListQueryDTO, toBoolean } from '../../../../common/dto/list-query.dto';

/** Picker rows: one page of { id, name } sorted by shown name, narrowed by `search`. */
export class GetClientOptionsQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ default: false, description: 'Include clients archived because they no longer exist in Apptivo' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
