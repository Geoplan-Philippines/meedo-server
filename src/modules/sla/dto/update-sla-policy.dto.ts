import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSlaPolicyDTO } from './create-sla-policy.dto';

export class UpdateSlaPolicyDTO extends PartialType(CreateSlaPolicyDTO) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
