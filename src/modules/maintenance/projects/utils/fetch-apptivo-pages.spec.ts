import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { env } from '../../../../core/config/env.config';
import { PrismaService } from '../../../../core/database/prisma.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { ClientsService } from '../../clients/clients.service';
import { ProjectsService } from '../projects.service';
import { FakeApptivoSyncPrisma } from '../../../../../test/fakes/apptivo-sync-prisma.fake';
import { fetchApptivoPages } from './fetch-apptivo-pages';

describe('Apptivo request deadline and retry', () => {
  const logger = new Logger('test');
  const fetchMock = jest.fn();
  const calls = () => fetchMock.mock.calls as [string, { signal: AbortSignal }][];
  const ok = (data: unknown[] = []) => ({ ok: true, json: () => Promise.resolve({ data }) });
  const read = () => fetchApptivoPages('https://example.test/?a=list', 'work orders', logger);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockReset();
    jest.replaceProperty(env, 'APPTIVO_REQUEST_TIMEOUT_MS', 1000);
    jest.replaceProperty(env, 'APPTIVO_REQUEST_MAX_RETRIES', 2);
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it.each(['headers', 'body'])('aborts stalled %s at the deadline', async (stage) => {
    jest.replaceProperty(env, 'APPTIVO_REQUEST_MAX_RETRIES', 0);
    fetchMock.mockImplementation(() => stage === 'headers' ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
    const result = expect(read()).rejects.toThrow('page 1 failed: timeout after 1000 ms');
    await jest.advanceTimersByTimeAsync(999);
    expect(calls()[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await result;
    expect(calls()[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([429, 502, 503, 504, 'network'])('retries transient %s then succeeds', async (status) => {
    if (status === 'network') fetchMock.mockRejectedValueOnce(new Error('connection lost'));
    else fetchMock.mockResolvedValueOnce({ ok: false, status });
    fetchMock.mockResolvedValueOnce(ok([{ id: 'recovered' }]));
    const result = read();
    await jest.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual([{ id: 'recovered' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 403, 404, 500])('does not retry HTTP %s', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(read()).rejects.toThrow(`page 1 failed: HTTP ${status} after 1 attempt`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the page and reason after exhausting two retries', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const result = expect(read()).rejects.toThrow('page 1 failed: HTTP 503 after 3 attempt(s)');
    await jest.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries timeouts at most twice', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = expect(read()).rejects.toThrow('timeout after 1000 ms after 3 attempt(s)');
    await jest.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a network failure while reading the response body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new TypeError('connection terminated')) }).mockResolvedValueOnce(ok());
    const result = read();
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry malformed JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError('bad JSON')) });
    await expect(read()).rejects.toThrow('invalid response body');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('imports nothing on a later-page failure and a later invocation succeeds', async () => {
    jest.spyOn(Math, 'random').mockRestore();
    const fake = new FakeApptivoSyncPrisma();
    const module = await Test.createTestingModule({ providers: [ProjectsService, ClientsService,
      { provide: PrismaService, useValue: fake },
      { provide: NotificationsService, useValue: { createMany: jest.fn() } },
    ] }).compile();
    const clients = module.get(ClientsService);
    jest.spyOn(clients, 'fetchApptivoCustomers').mockResolvedValue([{ customerId: 'cust-1', customerName: 'Example' }]);
    const service = module.get(ProjectsService);
    const records = Array.from({ length: 501 }, (_, i) => ({ id: `wo-${i}`, workOrderNumber: `SO-${i}`, customerId: 'cust-1', customerName: 'Example', statusName: 'active', total: '0' }));
    fetchMock.mockResolvedValueOnce(ok(records.slice(0, 500))).mockResolvedValue({ ok: false, status: 503 });
    const failed = expect(service.syncWorkOrdersFromApptivo('org-test')).rejects.toThrow('page 2 failed');
    await jest.runAllTimersAsync();
    await failed;
    expect(fake.$transaction).not.toHaveBeenCalled();
    expect(fake.client.rows).toHaveLength(0);
    expect(fake.project.rows).toHaveLength(0);
    fetchMock.mockReset().mockResolvedValueOnce(ok(records.slice(0, 500))).mockResolvedValueOnce(ok(records.slice(500)));
    await service.syncWorkOrdersFromApptivo('org-test');
    expect(fake.$transaction).toHaveBeenCalledTimes(1);
    expect(fake.project.rows).toHaveLength(501);
    expect(new URL(calls()[0][0]).searchParams.get('startIndex')).toBe('0');
    await module.close();
  });
});
