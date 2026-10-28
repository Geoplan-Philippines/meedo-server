import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_LIMITS } from '../constants/campaign.constants';

export const trimCampaignText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCampaignDTO {
  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.name, example: 'Example product update' })
  @Transform(trimCampaignText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_LIMITS.name)
  name!: string;

  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.subject, example: 'News from the example team' })
  @Transform(trimCampaignText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_LIMITS.subject)
  subject!: string;

  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.body, description: 'Draft content; stored only. Sending is unavailable.' })
  @Transform(trimCampaignText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_LIMITS.body)
  body!: string;
}
