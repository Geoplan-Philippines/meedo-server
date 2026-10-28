import { PartialType } from '@nestjs/swagger';
import { CreateCampaignDTO } from './create-campaign.dto';

// Undefined fields may be omitted; null must still fail the string validators.
export class UpdateCampaignDTO extends PartialType(CreateCampaignDTO, { skipNullProperties: false }) {}
