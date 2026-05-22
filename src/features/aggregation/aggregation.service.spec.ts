import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService } from '../../core/queue/queue.service';

// ─── Mock Prisma ────────────────────────────────────────────────────────────
const mockPrisma: any = {
  space: { findFirst: jest.fn() },
  event: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  aggregationJobLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  spaceRevenueMinuteAgg: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  spaceProductRevenueDailyAgg: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  weezeventLocation: { findMany: jest.fn() },
  weezeventLocationSpaceMapping: { findFirst: jest.fn(), findMany: jest.fn() },
  weezeventLocationShopMapping: { findMany: jest.fn(), count: jest.fn() },
  weezeventTransaction: { findMany: jest.fn() },
  weezeventEvent: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

const mockQueueService: any = {
  queueAggregationJob: jest.fn(),
};

// ─── Fixture helpers ────────────────────────────────────────────────────────
const TENANT = 'tenant-1';
const SPACE = 'space-1';
const EVENT_1 = 'event-1';
const EVENT_2 = 'event-2';
const INT_ID = 'integration-1';
const JOB_LOG_ID = 'joblog-1';
const LOCATION_ID = 'loc-1';

const makeEvent = (id: string, daysAgo = 10): any => ({
  id,
  name: `Event ${id}`,
  tenantId: TENANT,
  spaceId: SPACE,
  eventDate: new Date(Date.now() - daysAgo * 86400_000),
  eventEndDate: null,
});

const makeJob = (status = 'completed', eventIds = [EVENT_1]): any => ({
  id: JOB_LOG_ID,
  tenantId: TENANT,
  spaceId: SPACE,
  status,
  startedAt: new Date(Date.now() - 5000),
  completedAt: status === 'completed' ? new Date() : null,
  transactionsProcessed: status === 'completed' ? 3 : 0,
  metadata: { eventIds },
  error: null,
});

const makeBullJob = (overrides: any = {}): any => ({
  data: {
    tenantId: TENANT,
    spaceId: SPACE,
    eventIds: [EVENT_1],
    integrationId: INT_ID,
    jobLogId: JOB_LOG_ID,
    type: 'process-events',
    ...overrides,
  },
  updateProgress: jest.fn().mockResolvedValue(undefined),
});

// ─── Suite ──────────────────────────────────────────────────────────────────
describe('AggregationService', () => {
  let service: AggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
    jest.clearAllMocks();
  });

  // ─── getEventsTimelineStatus ─────────────────────────────────────────────
  describe('getEventsTimelineStatus', () => {
    beforeEach(() => {
      mockPrisma.space.findFirst.mockResolvedValue({ id: SPACE, tenantId: TENANT });
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1), makeEvent(EVENT_2)]);
      mockPrisma.event.count.mockResolvedValue(0); // futureEventsCount
      mockPrisma.aggregationJobLog.findMany.mockResolvedValue([makeJob('completed', [EVENT_1])]);
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([
        { weezeventEventId: EVENT_1, _sum: { transactionsCount: 480 } },
      ]);
      mockPrisma.weezeventLocation.findMany.mockResolvedValue([]);
      mockPrisma.weezeventLocationShopMapping.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([]);
    });

    it('retourne events avec aggregationStatus depuis le job log', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].aggregationStatus).toBe('completed');
      expect(result.events[1].aggregationStatus).toBe('pending'); // pas de job pour event-2
    });

    it('retourne dataPoints depuis spaceRevenueMinuteAgg (batch — pas de N+1)', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      // Vérifier que groupBy a été appelé une seule fois (pas N fois)
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledTimes(1);
      expect(result.events[0].dataPoints).toBe(480);
      expect(result.events[1].dataPoints).toBe(0);
    });

    it('retourne transactionStats non null quand integrationId fourni et locations existent', async () => {
      mockPrisma.weezeventLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // unregisteredDates
        .mockResolvedValueOnce([{ total: BigInt(100), matched: BigInt(80) }]) // totalRow
        .mockResolvedValueOnce([]); // unmappedRows

      const result = await service.getEventsTimelineStatus(TENANT, SPACE, INT_ID);

      expect(result.transactionStats).not.toBeNull();
      expect(result.transactionStats!.total).toBe(100);
      expect(result.transactionStats!.matched).toBe(80);
      expect(result.transactionStats!.unmatched).toBe(20);
    });

    it('ne plante pas quand aucun event passé (régression join([]))', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.weezeventLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // unregisteredDates
        .mockResolvedValueOnce([{ total: BigInt(12), matched: BigInt(0) }]) // totalRow sans événements
        .mockResolvedValueOnce([]); // unmappedRows

      const result = await service.getEventsTimelineStatus(TENANT, SPACE, INT_ID);

      expect(result.events).toHaveLength(0);
      expect(result.transactionStats).toEqual({
        total: 12,
        matched: 0,
        unmatched: 12,
        unmappedLocationIds: [],
      });
    });

    it('retourne transactionStats = null sans integrationId', async () => {
      const result = await service.getEventsTimelineStatus(TENANT, SPACE);
      expect(result.transactionStats).toBeNull();
    });

    it('retourne summary avec le bon comptage de statuts', async () => {
      mockPrisma.aggregationJobLog.findMany.mockResolvedValue([
        makeJob('completed', [EVENT_1]),
        makeJob('skipped', [EVENT_2]),
      ]);

      const result = await service.getEventsTimelineStatus(TENANT, SPACE);

      expect(result.summary.processed).toBe(1);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.pending).toBe(0);
    });

    it('lance NotFoundException si space introuvable', async () => {
      mockPrisma.space.findFirst.mockResolvedValue(null);
      await expect(service.getEventsTimelineStatus(TENANT, 'bad-space')).rejects.toThrow(NotFoundException);
    });

    it('ne fait aucune requête N+1 (findFirst par event) pour les jobs', async () => {
      // On vérifie qu'aggregationJobLog.findFirst n'est jamais appelé (remplacé par findMany batch)
      await service.getEventsTimelineStatus(TENANT, SPACE);
      expect(mockPrisma.aggregationJobLog.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── processEvents ───────────────────────────────────────────────────────
  describe('processEvents', () => {
    beforeEach(() => {
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.aggregationJobLog.create.mockResolvedValue({ id: JOB_LOG_ID });
      mockQueueService.queueAggregationJob.mockResolvedValue(undefined);
    });

    it('retourne jobId + status "queued"', async () => {
      const result = await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(result).toMatchObject({ jobId: JOB_LOG_ID, status: 'queued', total: 1 });
    });

    it('crée un AggregationJobLog avec status "pending"', async () => {
      await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(mockPrisma.aggregationJobLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending', tenantId: TENANT, spaceId: SPACE }) }),
      );
    });

    it('enqueue le job via QueueService', async () => {
      await service.processEvents(TENANT, SPACE, [EVENT_1], INT_ID);

      expect(mockQueueService.queueAggregationJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'process-events', tenantId: TENANT, spaceId: SPACE }),
      );
    });

    it('retourne {processed:0, total:0} si aucun event trouvé', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      const result = await service.processEvents(TENANT, SPACE, ['missing']);
      expect(result).toMatchObject({ processed: 0, total: 0 });
    });
  });

  // ─── executeProcessEvents ────────────────────────────────────────────────
  describe('executeProcessEvents', () => {
    const makeTransaction = (locationId = LOCATION_ID, minuteOffset = 0): any => ({
      id: `tx-${minuteOffset}`,
      tenantId: TENANT,
      locationId,
      transactionDate: new Date(new Date('2025-05-10T20:00:00Z').getTime() + minuteOffset * 60_000),
      amount: '50.00',
      items: [
        { productId: 'prod-1', unitPrice: '25.00', quantity: 2, reduction: '0' },
      ],
    });

    beforeEach(() => {
      mockPrisma.aggregationJobLog.update.mockResolvedValue({});
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.weezeventLocationSpaceMapping.findFirst.mockResolvedValue({ spaceId: SPACE });
      mockPrisma.weezeventLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.weezeventLocationShopMapping.findMany.mockResolvedValue([
        { weezeventLocationId: LOCATION_ID, spaceElementId: 'element-1' },
      ]);
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([makeTransaction()]);
      mockPrisma.spaceRevenueMinuteAgg.upsert.mockResolvedValue({});
      mockPrisma.spaceProductRevenueDailyAgg.upsert.mockResolvedValue({});
    });

    it('upsert sur spaceRevenueMinuteAgg (pas spaceRevenueDailyAgg)', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).toHaveBeenCalled();
      // S'assurer qu'on n'utilise pas l'ancienne table
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert.mock.calls[0][0]).toMatchObject(
        expect.objectContaining({ where: expect.objectContaining({
          tenantId_spaceId_minute_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId: expect.any(Object),
        }) }),
      );
    });

    it('itemsCount = somme des quantités (fix #6)', async () => {
      // Transaction avec items [qty:2, qty:3] → itemsCount doit être 5, pas 2
      const tx: any = {
        id: 'tx-multi',
        tenantId: TENANT,
        locationId: LOCATION_ID,
        transactionDate: new Date('2025-05-10T20:00:00Z'),
        amount: '100',
        items: [
          { productId: 'p1', unitPrice: '20', quantity: 2, reduction: '0' },
          { productId: 'p2', unitPrice: '20', quantity: 3, reduction: '0' },
        ],
      };
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([tx]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const upsertCall = mockPrisma.spaceRevenueMinuteAgg.upsert.mock.calls[0][0];
      expect(upsertCall.create.itemsCount).toBe(5); // 2 + 3
    });

    it('revenue = sum(unitPrice * qty - reduction) sur les items (fix #7b)', async () => {
      // [25 * 2 - 0] = 50
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const upsertCall = mockPrisma.spaceRevenueMinuteAgg.upsert.mock.calls[0][0];
      expect(Number(upsertCall.create.revenueHt)).toBeCloseTo(50);
    });

    it('regroupe par (locationId, minute) — 2 transactions même minute → 1 upsert', async () => {
      const tx1 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-a' };
      const tx2 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-b' }; // même minute
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([tx1, tx2]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // Une seule clé (locationId:minute) → 1 upsert pour cette location+minute
      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockPrisma.spaceRevenueMinuteAgg.upsert.mock.calls[0][0];
      expect(upsertCall.create.transactionsCount).toBe(2);
    });

    it('regroupe par (locationId, minute) — 2 minutes différentes → 2 upserts', async () => {
      const tx1 = { ...makeTransaction(LOCATION_ID, 0), id: 'tx-a' };   // minute 20:00
      const tx2 = { ...makeTransaction(LOCATION_ID, 1), id: 'tx-b' };   // minute 20:01
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([tx1, tx2]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).toHaveBeenCalledTimes(2);
    });

    it('ignore les transactions sans locationId', async () => {
      const tx: any = { ...makeTransaction(), locationId: null };
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([tx]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
    });

    it('ignore les locations sans shop mapping (unmapped)', async () => {
      mockPrisma.weezeventLocationShopMapping.findMany.mockResolvedValue([]); // aucun mapping

      const job = makeBullJob();
      const result = await service.executeProcessEvents(job);

      expect(mockPrisma.spaceRevenueMinuteAgg.upsert).not.toHaveBeenCalled();
      expect(result.results[0].unmappedLocations).toContain(LOCATION_ID);
    });

    it('utilise eventEndDate pour les events multi-jours (fix #8)', async () => {
      const multiDayEvent: any = {
        ...makeEvent(EVENT_1),
        eventEndDate: new Date('2025-05-12T00:00:00Z'), // 2 jours après eventDate
      };
      mockPrisma.event.findMany.mockResolvedValue([multiDayEvent]);

      const job = makeBullJob();
      await service.executeProcessEvents(job);

      // nextDay = eventEndDate + 1 jour → filtre étendu
      const txCall = mockPrisma.weezeventTransaction.findMany.mock.calls[0][0];
      const toDate = txCall.where.transactionDate.lt;
      expect(toDate.getDate()).toBe(13); // 12 + 1
    });

    it('lance une erreur si integration pas mappée au space', async () => {
      mockPrisma.weezeventLocationSpaceMapping.findFirst.mockResolvedValue({ spaceId: 'other-space' });

      const job = makeBullJob();
      await expect(service.executeProcessEvents(job)).rejects.toThrow(/mapped to a different space/);
    });

    it('met à jour AggregationJobLog à "completed" en fin de traitement', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      const lastUpdate = mockPrisma.aggregationJobLog.update.mock.calls.slice(-1)[0][0];
      expect(lastUpdate.data.status).toBe('completed');
    });

    it('met à jour la progression BullMQ (updateProgress)', async () => {
      const job = makeBullJob();
      await service.executeProcessEvents(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });

  // ─── executeSynchronize ──────────────────────────────────────────────────
  describe('executeSynchronize', () => {
    beforeEach(() => {
      mockPrisma.aggregationJobLog.update.mockResolvedValue({});
      mockPrisma.event.findMany.mockResolvedValue([makeEvent(EVENT_1)]);
      mockPrisma.weezeventLocationSpaceMapping.findFirst.mockResolvedValue({ spaceId: SPACE });
      mockPrisma.weezeventLocation.findMany.mockResolvedValue([{ id: LOCATION_ID }]);
      mockPrisma.weezeventLocationShopMapping.findMany.mockResolvedValue([
        { weezeventLocationId: LOCATION_ID, spaceElementId: 'element-1' },
      ]);
      mockPrisma.weezeventTransaction.findMany.mockResolvedValue([]);
      mockPrisma.spaceRevenueMinuteAgg.upsert.mockResolvedValue({});
      mockPrisma.spaceProductRevenueDailyAgg.upsert.mockResolvedValue({});
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: null, transactionsCount: null, itemsCount: null },
        _count: 0,
      });
      // $transaction exécute les deleteMany passées
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        for (const op of ops) await op;
      });
      mockPrisma.spaceRevenueMinuteAgg.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.spaceProductRevenueDailyAgg.deleteMany.mockResolvedValue({ count: 2 });
    });

    it('nettoie les 2 tables dans une transaction atomique (fix #9)', async () => {
      const job = makeBullJob({ type: 'synchronize' });
      await service.executeSynchronize(job);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      // Les 2 deleteMany doivent être dans la même transaction
      expect(txOps).toHaveLength(2);
    });

    it('retourne un summary avec totalRevenue', async () => {
      mockPrisma.spaceRevenueMinuteAgg.aggregate.mockResolvedValue({
        _sum: { revenueHt: '1234.56', transactionsCount: 100, itemsCount: 500 },
        _count: 200,
      });

      const job = makeBullJob({ type: 'synchronize' });
      const result = await service.executeSynchronize(job);

      expect(result.summary.totalRevenue).toBeCloseTo(1234.56);
      expect(result.summary.totalTransactions).toBe(100);
    });
  });

  // ─── getJobProgress ──────────────────────────────────────────────────────
  describe('getJobProgress', () => {
    it('retourne percentage=100 si status=completed', async () => {
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(makeJob('completed'));
      mockPrisma.spaceRevenueMinuteAgg.count.mockResolvedValue(480);

      const result = await service.getJobProgress(TENANT, JOB_LOG_ID);

      expect(result.percentage).toBe(100);
      expect(result.status).toBe('completed');
    });

    it('calcule percentage proportionnel quand status=running', async () => {
      const job = makeJob('running', [EVENT_1, EVENT_2]);
      job.transactionsProcessed = 1;
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(job);
      mockPrisma.spaceRevenueMinuteAgg.count.mockResolvedValue(0);

      const result = await service.getJobProgress(TENANT, JOB_LOG_ID);

      expect(result.percentage).toBe(50); // 1/2 = 50%
      expect(result.current).toBe(1);
      expect(result.total).toBe(2);
    });

    it('lance NotFoundException si jobId inconnu', async () => {
      mockPrisma.aggregationJobLog.findFirst.mockResolvedValue(null);
      await expect(service.getJobProgress(TENANT, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getEventMinuteChart ─────────────────────────────────────────────────
  describe('getEventMinuteChart', () => {
    const MINUTE_1 = new Date('2025-05-10T20:00:00Z');
    const MINUTE_2 = new Date('2025-05-10T20:01:00Z');

    beforeEach(() => {
      mockPrisma.event.findFirst.mockResolvedValue(makeEvent(EVENT_1));
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([
        { minute: MINUTE_1, _sum: { revenueHt: '45.00', transactionsCount: 3, itemsCount: 7 } },
        { minute: MINUTE_2, _sum: { revenueHt: '30.00', transactionsCount: 2, itemsCount: 4 } },
      ]);
    });

    it('retourne eventId + eventName + data[]', async () => {
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);

      expect(result.eventId).toBe(EVENT_1);
      expect(result.eventName).toBe(`Event ${EVENT_1}`);
      expect(result.data).toHaveLength(2);
    });

    it('chaque point a minute + revenueHt + transactionsCount + itemsCount', async () => {
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      const point = result.data[0];

      expect(point.minute).toEqual(MINUTE_1);
      expect(point.revenueHt).toBeCloseTo(45);
      expect(point.transactionsCount).toBe(3);
      expect(point.itemsCount).toBe(7);
    });

    it('retourne data=[] si aucune donnée SpaceRevenueMinuteAgg', async () => {
      mockPrisma.spaceRevenueMinuteAgg.groupBy.mockResolvedValue([]);
      const result = await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      expect(result.data).toHaveLength(0);
    });

    it('lance NotFoundException si event introuvable', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getEventMinuteChart(TENANT, SPACE, 'bad-event')).rejects.toThrow(NotFoundException);
    });

    it('utilise groupBy sur spaceRevenueMinuteAgg (pas spaceRevenueDailyAgg)', async () => {
      await service.getEventMinuteChart(TENANT, SPACE, EVENT_1);
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledTimes(1);
      // Confirmer le filtre weezeventEventId
      expect(mockPrisma.spaceRevenueMinuteAgg.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ weezeventEventId: EVENT_1 }) }),
      );
    });
  });

  // ─── skipEvent ───────────────────────────────────────────────────────────
  describe('skipEvent', () => {
    it('crée un job log avec status "skipped"', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(makeEvent(EVENT_1));
      mockPrisma.aggregationJobLog.create.mockResolvedValue({ id: 'skip-job' });

      const result = await service.skipEvent(TENANT, SPACE, EVENT_1);

      expect(result).toMatchObject({ eventId: EVENT_1, status: 'skipped' });
      expect(mockPrisma.aggregationJobLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'skipped', jobType: 'skip' }) }),
      );
    });

    it('lance NotFoundException si event introuvable', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);
      await expect(service.skipEvent(TENANT, SPACE, 'bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── markJobLogFailed ────────────────────────────────────────────────────
  describe('markJobLogFailed', () => {
    it('updateMany avec status="failed" seulement si pas déjà completed', async () => {
      mockPrisma.aggregationJobLog.updateMany.mockResolvedValue({ count: 1 });

      await service.markJobLogFailed(JOB_LOG_ID, 'timeout error');

      expect(mockPrisma.aggregationJobLog.updateMany).toHaveBeenCalledWith({
        where: { id: JOB_LOG_ID, status: { not: 'completed' } },
        data: expect.objectContaining({ status: 'failed', error: 'timeout error' }),
      });
    });
  });
});
