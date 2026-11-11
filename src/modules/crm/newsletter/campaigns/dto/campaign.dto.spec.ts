import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CAMPAIGN_LIMITS } from '../constants/campaign.constants';
import { CreateCampaignDTO } from './create-campaign.dto';
import { GetAllCampaignsQueryDTO } from './get-all-campaigns-query.dto';
import { UpdateCampaignDTO } from './update-campaign.dto';

describe('Campaign DTO validation', () => {
  const valid = { name: 'Example', subject: 'Example news', body: '<p>Example body</p>' };
  it('trims all required text before validating', async () => {
    const dto = plainToInstance(CreateCampaignDTO, { name: ' Example ', subject: ' Example news ', body: ' <p>Example body</p> ' });
    expect(dto).toEqual(valid);
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(['name', 'subject', 'body'] as const)('accepts exactly the %s limit and rejects overflow', async field => {
    expect(await validate(plainToInstance(CreateCampaignDTO, { ...valid, [field]: 'x'.repeat(CAMPAIGN_LIMITS[field]) }))).toHaveLength(0);
    expect(await validate(plainToInstance(CreateCampaignDTO, { ...valid, [field]: 'x'.repeat(CAMPAIGN_LIMITS[field] + 1) }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateCampaignDTO, { [field]: 'x'.repeat(CAMPAIGN_LIMITS[field] + 1) }))).not.toHaveLength(0);
  });
  it.each(['name', 'subject', 'body'] as const)('rejects whitespace, null and non-string %s', async field => {
    for (const value of ['   ', null, 42]) {
      expect(await validate(plainToInstance(CreateCampaignDTO, { ...valid, [field]: value }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(UpdateCampaignDTO, { [field]: value }))).not.toHaveLength(0);
    }
  });
  it('allows an omitted update field', async () => {
    expect(await validate(plainToInstance(UpdateCampaignDTO, { subject: 'Updated' }))).toHaveLength(0);
  });
  it('rejects organization, actor and status input through the global whitelist convention', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const field of ['organizationId', 'createdByMemberId', 'status']) {
      await expect(pipe.transform({ ...valid, [field]: 'invented' }, { type: 'body', metatype: CreateCampaignDTO })).rejects.toThrow();
    }
  });
  it('coerces pagination and explicit archive booleans and rejects malformed values', async () => {
    const dto = plainToInstance(GetAllCampaignsQueryDTO, { page: '2', limit: '5', search: ' Example ', includeArchived: 'false' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({ page: 2, limit: 5, search: 'Example', includeArchived: false });
    expect(plainToInstance(GetAllCampaignsQueryDTO, { includeArchived: 'true' }).includeArchived).toBe(true);
    for (const invalid of [{ page: 0 }, { limit: 51 }, { page: 'NaN' }, { includeArchived: 'yes' }, { search: 'x'.repeat(201) }]) {
      expect(await validate(plainToInstance(GetAllCampaignsQueryDTO, invalid))).not.toHaveLength(0);
    }
  });
});
