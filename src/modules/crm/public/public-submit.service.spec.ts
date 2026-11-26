import { HttpStatus } from '@nestjs/common';
import { FieldCollection, SubscriberStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { LEAD_SYSTEM_FIELDS, SUBSCRIBER_SYSTEM_FIELDS } from '../field-definitions/system-fields';
import { CrmEventsService } from '../integration/crm-events.service';
import { PublicSubmitService } from './public-submit.service';

const org = 'org-a';
const leadFields = LEAD_SYSTEM_FIELDS.map((field) => ({
  key: field.key,
  type: field.type,
  options: field.options,
  isRequired: field.isRequired,
  isReadOnly: field.isReadOnly,
}));
const subscriberFields = SUBSCRIBER_SYSTEM_FIELDS.map((field) => ({
  key: field.key,
  type: field.type,
  options: field.options,
  isRequired: field.isRequired,
  isReadOnly: field.isReadOnly,
}));

const validLead = {
  values: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'Ada@Example.com',
    message: 'Hello',
  },
};

describe('PublicSubmitService', () => {
  const prisma = {
    fieldDefinition: { findMany: jest.fn() },
    publicSubmitCounter: { upsert: jest.fn() },
    lead: { create: jest.fn() },
    newsletterSubscriber: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const events = { enqueue: jest.fn() };
  const service = new PublicSubmitService(
    prisma as unknown as PrismaService,
    events as unknown as CrmEventsService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    events.enqueue.mockResolvedValue(undefined);
    prisma.publicSubmitCounter.upsert.mockResolvedValue({ count: 1 });
  });

  it('creates a lead and enqueues lead.created', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(leadFields);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    await expect(service.submitLead(org, validLead)).resolves.toEqual({ id: 'lead-1' });
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: org,
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        message: 'Hello',
      }),
    });
    expect(events.enqueue).toHaveBeenCalledWith(org, 'lead.created', { id: 'lead-1', organizationId: org });
  });

  it('returns success and skips create, cap, and events when the honeypot is filled', async () => {
    await expect(service.submitLead(org, { ...validLead, honeypot: 'bot' })).resolves.toEqual({
      id: expect.any(String),
    });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.publicSubmitCounter.upsert).not.toHaveBeenCalled();
    expect(events.enqueue).not.toHaveBeenCalled();
  });

  it('rejects submits after the daily cap', async () => {
    prisma.publicSubmitCounter.upsert.mockResolvedValue({ count: 1001 });
    const error = await service.submitLead(org, validLead).catch((caught) => caught);
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('is idempotent for an already subscribed email', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(subscriberFields);
    prisma.newsletterSubscriber.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: SubscriberStatus.SUBSCRIBED,
    });
    await expect(service.submitSubscriber(org, { values: { email: 'ada@example.com' } })).resolves.toEqual({
      id: 'sub-1',
    });
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    expect(events.enqueue).not.toHaveBeenCalled();
  });

  it('re-subscribes an unsubscribed email', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(subscriberFields);
    prisma.newsletterSubscriber.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: SubscriberStatus.UNSUBSCRIBED,
      values: {},
    });
    prisma.newsletterSubscriber.update.mockResolvedValue({
      id: 'sub-1',
      unsubscribeToken: 'secret',
    });
    await expect(service.submitSubscriber(org, { values: { email: 'ada@example.com' } })).resolves.toEqual({
      id: 'sub-1',
    });
    expect(prisma.newsletterSubscriber.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        email: 'ada@example.com',
        status: SubscriberStatus.SUBSCRIBED,
        unsubscribedAt: null,
      }),
    });
    expect(events.enqueue).toHaveBeenCalledWith(org, 'subscriber.created', { id: 'sub-1', organizationId: org });
  });

  it('creates a subscriber for a new email', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(subscriberFields);
    prisma.newsletterSubscriber.findFirst.mockResolvedValue(null);
    prisma.newsletterSubscriber.create.mockResolvedValue({ id: 'sub-2' });
    await expect(service.submitSubscriber(org, { values: { email: 'ada@example.com' } })).resolves.toEqual({
      id: 'sub-2',
    });
    expect(prisma.newsletterSubscriber.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: org,
        email: 'ada@example.com',
      }),
    });
    expect(prisma.newsletterSubscriber.create.mock.calls[0][0].data.unsubscribeToken).toEqual(expect.any(String));
    expect(events.enqueue).toHaveBeenCalledWith(org, 'subscriber.created', { id: 'sub-2', organizationId: org });
  });

  it('loads field definitions for the requested collection', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(leadFields);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    await service.submitLead(org, validLead);
    expect(prisma.fieldDefinition.findMany).toHaveBeenCalledWith({
      where: { organizationId: org, collection: FieldCollection.lead },
    });
  });
});
