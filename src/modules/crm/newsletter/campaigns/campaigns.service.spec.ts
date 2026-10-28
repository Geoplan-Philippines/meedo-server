import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NewsletterCampaign, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { CampaignsService } from './campaigns.service';
import { GetAllCampaignsQueryDTO } from './dto/get-all-campaigns-query.dto';

describe('CampaignsService', () => {
  const org = 'example-org-a';
  const user = 'example-user';
  const payload = { name: 'Example draft', subject: 'Example news', body: '<p>Example content</p>' };
  const draft: NewsletterCampaign = { id: 'example-campaign', organizationId: org, ...payload, status: 'DRAFT', createdByMemberId: 'example-member', createdAt: new Date(), updatedAt: new Date() };
  const prisma = {
    member: { findUnique: jest.fn() },
    newsletterCampaign: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: CampaignsService;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role: 'owner' });
    prisma.newsletterCampaign.findFirst.mockResolvedValue(draft);
    prisma.newsletterCampaign.findMany.mockResolvedValue([draft]);
    prisma.newsletterCampaign.count.mockResolvedValue(1);
    prisma.newsletterCampaign.create.mockResolvedValue(draft);
    prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    service = new CampaignsService(prisma as unknown as PrismaService);
  });

  it('creates a trimmed draft with the resolved member and organization', async () => {
    await expect(service.create({ name: ' Example draft ', subject: ' Example news ', body: ' <p>Example content</p> ' }, org, user)).resolves.toEqual(draft);
    expect(prisma.member.findUnique).toHaveBeenCalledWith({ where: { organizationId_userId: { organizationId: org, userId: user } }, select: { id: true, role: true } });
    expect(prisma.newsletterCampaign.create).toHaveBeenCalledWith({ data: { ...payload, organizationId: org, createdByMemberId: 'example-member' } });
  });

  it('updates draft text with organization and status predicates on the actual write', async () => {
    await service.update(draft.id, { subject: ' Revised ' }, org, user);
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalledWith({ where: { id: draft.id, organizationId: org, status: 'DRAFT' }, data: { subject: 'Revised' } });
  });

  it('rejects editing an archived campaign', async () => {
    prisma.newsletterCampaign.findFirst.mockResolvedValue({ ...draft, status: 'ARCHIVED' });
    await expect(service.update(draft.id, payload, org, user)).rejects.toThrow(BadRequestException);
    expect(prisma.newsletterCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a draft edit if a concurrent archive wins', async () => {
    prisma.newsletterCampaign.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update(draft.id, payload, org, user)).rejects.toThrow(BadRequestException);
  });

  it.each([['archive', 'ARCHIVED'], ['restore', 'DRAFT']] as const)('%s only changes the scoped status', async (action, status) => {
    await service[action](draft.id, org, user);
    expect(prisma.newsletterCampaign.updateMany).toHaveBeenCalledWith({ where: { id: draft.id, organizationId: org }, data: { status } });
  });

  const operations = {
    list: () => service.list(new GetAllCampaignsQueryDTO(), org, user),
    get: () => service.get(draft.id, org, user),
    create: () => service.create(payload, org, user),
    update: () => service.update(draft.id, payload, org, user),
    archive: () => service.archive(draft.id, org, user),
    restore: () => service.restore(draft.id, org, user),
  };
  it.each(['list', 'get'] as const)('allows an ordinary member to %s', async action => {
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role: 'member' });
    await expect(operations[action]()).resolves.toBeDefined();
  });
  it.each(['create', 'update', 'archive', 'restore'] as const)('rejects member %s before any campaign write', async action => {
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role: 'member' });
    await expect(operations[action]()).rejects.toThrow(ForbiddenException);
    expect(prisma.newsletterCampaign.create).not.toHaveBeenCalled();
    expect(prisma.newsletterCampaign.updateMany).not.toHaveBeenCalled();
  });
  it.each(['owner', 'admin'])('allows %s mutations', async role => {
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role });
    for (const action of ['create', 'update', 'archive', 'restore'] as const) await expect(operations[action]()).resolves.toBeDefined();
  });
  it.each(Object.keys(operations) as (keyof typeof operations)[])('rejects %s without membership', async action => {
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(operations[action]()).rejects.toThrow(ForbiddenException);
    expect(prisma.newsletterCampaign.findFirst).not.toHaveBeenCalled();
    expect(prisma.newsletterCampaign.findMany).not.toHaveBeenCalled();
  });
  it.each(['', undefined, null])('rejects missing identity %s', async identity => {
    await expect(service.create(payload, org, identity as unknown as string)).rejects.toThrow(ForbiddenException);
    await expect(service.list(new GetAllCampaignsQueryDTO(), org, identity as unknown as string)).rejects.toThrow(ForbiddenException);
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });
  it('rejects missing organization with 403', async () => {
    await expect(service.get(draft.id, '', user)).rejects.toThrow(ForbiddenException);
  });

  it('uses identical organization, search and archive predicates for rows and count', async () => {
    const response = await service.list(Object.assign(new GetAllCampaignsQueryDTO(), { page: 2, limit: 5, search: ' Example ' }), org, user);
    const where = { organizationId: org, status: 'DRAFT', OR: [
      { name: { contains: 'Example', mode: 'insensitive' } },
      { subject: { contains: 'Example', mode: 'insensitive' } },
    ] };
    expect(prisma.newsletterCampaign.findMany).toHaveBeenCalledWith({ where, skip: 5, take: 5, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(prisma.newsletterCampaign.count).toHaveBeenCalledWith({ where });
    expect(response.meta).toEqual({ page: 2, limit: 5, total: 1, lastPage: 1 });
  });
  it('includes archives only when explicitly requested, without removing the org predicate', async () => {
    await service.list(Object.assign(new GetAllCampaignsQueryDTO(), { includeArchived: true }), org, user);
    expect(prisma.newsletterCampaign.count).toHaveBeenCalledWith({ where: { organizationId: org } });
  });
  it('excludes another organization from list results', async () => {
    const rows = [draft, { ...draft, id: 'other-campaign', organizationId: 'example-org-b' }];
    prisma.newsletterCampaign.findMany.mockImplementation(({ where }: Prisma.NewsletterCampaignFindManyArgs) => Promise.resolve(rows.filter(row => row.organizationId === where?.organizationId)));
    const response = await service.list(new GetAllCampaignsQueryDTO(), org, user);
    expect(response.data.map(row => row.id)).toEqual([draft.id]);
  });
  it.each(['get', 'update', 'archive', 'restore'] as const)('does not find another organization campaign during %s', async action => {
    prisma.newsletterCampaign.findFirst.mockImplementation(({ where }: Prisma.NewsletterCampaignFindFirstArgs) => Promise.resolve(where?.organizationId === 'example-org-b' ? draft : null));
    await expect(operations[action]()).rejects.toThrow(NotFoundException);
    expect(prisma.newsletterCampaign.findFirst).toHaveBeenCalledWith({ where: { id: draft.id, organizationId: org } });
    expect(prisma.newsletterCampaign.updateMany).not.toHaveBeenCalled();
  });
});
