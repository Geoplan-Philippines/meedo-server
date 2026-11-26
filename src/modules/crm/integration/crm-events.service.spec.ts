import { PrismaService } from '../../../core/database/prisma.service';
import { CrmEventsService } from './crm-events.service';

describe('CrmEventsService', () => {
  const prisma = {
    webhookEndpoint: { findMany: jest.fn() },
    webhookDelivery: { createMany: jest.fn() },
  };
  const service = new CrmEventsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('writes one pending delivery per enabled endpoint subscribed to the event', async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([{ id: 'ep-1' }, { id: 'ep-2' }]);
    prisma.webhookDelivery.createMany.mockResolvedValue({ count: 2 });
    await service.enqueue('org-a', 'lead.created', { id: 'lead-1', organizationId: 'org-a' });
    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-a', isEnabled: true, events: { has: 'lead.created' } },
      select: { id: true },
    });
    const written = prisma.webhookDelivery.createMany.mock.calls[0][0].data;
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(expect.objectContaining({
      endpointId: 'ep-1',
      organizationId: 'org-a',
      event: 'lead.created',
      payload: expect.objectContaining({
        type: 'lead.created',
        data: { id: 'lead-1', organizationId: 'org-a' },
      }),
    }));
  });

  it('does nothing when no endpoint is listening', async () => {
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    await service.enqueue('org-a', 'subscriber.unsubscribed', { id: 'sub-1' });
    expect(prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
  });
});
