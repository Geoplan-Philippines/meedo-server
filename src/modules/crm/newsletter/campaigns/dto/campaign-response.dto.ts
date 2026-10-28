import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsletterCampaignStatus } from '@prisma/client';
import { CAMPAIGN_LIMITS } from '../constants/campaign.constants';

export class CampaignDTO {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.name }) name!: string;
  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.subject }) subject!: string;
  @ApiProperty({ maxLength: CAMPAIGN_LIMITS.body }) body!: string;
  @ApiProperty({ enum: NewsletterCampaignStatus }) status!: NewsletterCampaignStatus;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) createdByMemberId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class CampaignPaginationDTO {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() lastPage!: number;
}

export class CampaignResponseDTO {
  @ApiProperty() statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty({ type: CampaignDTO }) data!: CampaignDTO;
}

export class CampaignListResponseDTO {
  @ApiProperty() statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [CampaignDTO] }) data!: CampaignDTO[];
  @ApiProperty({ type: CampaignPaginationDTO }) meta!: CampaignPaginationDTO;
}
