import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { LeadsService } from './leads/leads.service';
import { SubscribersService } from './newsletter/subscribers/subscribers.service';

const prisma = {
  lead: { findMany: jest.fn(), count: jest.fn() },
  newsletterSubscriber: { findMany: jest.fn(), count: jest.fn() },
};

const insensitive = (term: string) => ({ contains: term, mode: 'insensitive' });

describe('CRM lists page, search and sort in the database', () => {
  let leads: LeadsService;
  let subscribers: SubscribersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadsService, SubscribersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    leads = module.get(LeadsService);
    subscribers = module.get(SubscribersService);
    jest.resetAllMocks();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(42);
    prisma.newsletterSubscriber.findMany.mockResolvedValue([]);
    prisma.newsletterSubscriber.count.mockResolvedValue(7);
  });

  it('leads: newest first by default, with the total of all leads', async () => {
    const result = await leads.getAllLeads({ page: 3, limit: 10 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith({ where: {}, skip: 20, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    expect(result.meta).toEqual({ total: 42, page: 3, limit: 10, lastPage: 5 });
  });

  it('leads: every search word must match a name, email or company, and the count uses the same filter', async () => {
    await leads.getAllLeads({ page: 1, limit: 25, search: 'jane acme', status: LeadStatus.QUALIFIED, sortField: 'company', sortOrder: 'desc' });

    const where = {
      status: LeadStatus.QUALIFIED,
      AND: ['jane', 'acme'].map((term) => ({
        OR: [{ firstName: insensitive(term) }, { lastName: insensitive(term) }, { email: insensitive(term) }, { company: insensitive(term) }],
      })),
    };
    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where,
      orderBy: [{ company: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
    }));
    expect(prisma.lead.count).toHaveBeenCalledWith({ where });
  });

  it('subscribers: searches email and name and sorts by name with empty names last', async () => {
    const result = await subscribers.getAllSubscribers({ page: 1, limit: 10, search: 'sub', sortField: 'name' });

    const where = { AND: [{ OR: [{ email: insensitive('sub') }, { name: insensitive('sub') }] }] };
    expect(prisma.newsletterSubscriber.findMany).toHaveBeenCalledWith({
      where,
      skip: 0,
      take: 10,
      orderBy: [{ name: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    expect(prisma.newsletterSubscriber.count).toHaveBeenCalledWith({ where });
    expect(result.meta.total).toBe(7);
  });
});
