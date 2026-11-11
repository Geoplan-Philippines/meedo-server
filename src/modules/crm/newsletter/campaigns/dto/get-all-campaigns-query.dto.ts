import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDTO } from '../../../../../common/dto/pagination-query.dto';
import { CAMPAIGN_LIMITS } from '../constants/campaign.constants';
import { trimCampaignText } from './create-campaign.dto';

export class GetAllCampaignsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ maxLength: CAMPAIGN_LIMITS.name, description: 'Case-insensitive name or subject search.' })
  @IsOptional()
  @Transform(trimCampaignText)
  @IsString()
  @MaxLength(CAMPAIGN_LIMITS.name)
  search?: string;

  @ApiPropertyOptional({ type: Boolean, default: false, description: 'Include archived campaigns alongside drafts.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  includeArchived?: boolean;
}
