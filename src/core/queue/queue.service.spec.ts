import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueService, DataSyncJobData, AnalyticsJobData } from './queue.service';
import { QUEUES } from './queue.constants';

// Mock Queue
const createMockQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  addBulk: jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]),
  getJob: jest.fn(),
  getWaitingCount: jest.fn().mockResolvedValue(5),
  getActiveCount: jest.fn().mockResolvedValue(2),
  getCompletedCount: jest.fn().mockResolvedValue(100),
  getFailedCount: jest.fn().mockResolvedValue(3),
  getFailed: jest.fn().mockResolvedValue([]),
  pause: jest.fn(),
  resume: jest.fn(),
});

describe('QueueService', () => {
  let service: QueueService;
  let dataSyncQueue: ReturnType<typeof createMockQueue>;
  let analyticsQueue: ReturnType<typeof createMockQueue>;
  let notificationsQueue: ReturnType<typeof createMockQueue>;
  let exportsQueue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    dataSyncQueue = createMockQueue();
    analyticsQueue = createMockQueue();
    notificationsQueue = createMockQueue();
    exportsQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken(QUEUES.DATA_SYNC),
          useValue: dataSyncQueue,
        },
        {
          provide: getQueueToken(QUEUES.ANALYTICS),
          useValue: analyticsQueue,
        },
        {
          provide: getQueueToken(QUEUES.NOTIFICATIONS),
          useValue: notificationsQueue,
        },
        {
          provide: getQueueToken(QUEUES.EXPORTS),
          useValue: exportsQueue,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queueWeezeventSync', () => {
    it('should queue a Weezevent sync job', async () => {
      const tenantId = 'tenant-123';

      const result = await service.queueWeezeventSync(tenantId);

      expect(result).toEqual({ id: 'job-123' });
      expect(dataSyncQueue.add).toHaveBeenCalledWith(
        'weezevent-sync',
        {
          type: 'weezevent',
          tenantId,
          options: undefined,
        },
        expect.objectContaining({
          priority: 5,
          delay: 0,
        }),
      );
    });

    it('should queue with full sync option', async () => {
      const tenantId = 'tenant-123';
      const options = { fullSync: true };

      await service.queueWeezeventSync(tenantId, options);

      expect(dataSyncQueue.add).toHaveBeenCalledWith(
        'weezevent-sync',
        {
          type: 'weezevent',
          tenantId,
          options,
        },
        expect.objectContaining({
          priority: 10, // Lower priority for full sync
        }),
      );
    });
  });

  describe('queueBulkSync', () => {
    it('should queue multiple sync jobs with staggered delays', async () => {
      const tenantIds = ['tenant-1', 'tenant-2', 'tenant-3'];

      const result = await service.queueBulkSync(tenantIds);

      expect(result).toHaveLength(2);
      expect(dataSyncQueue.addBulk).toHaveBeenCalledWith([
        { name: 'weezevent-sync', data: { type: 'weezevent', tenantId: 'tenant-1' }, opts: { delay: 0 } },
        { name: 'weezevent-sync', data: { type: 'weezevent', tenantId: 'tenant-2' }, opts: { delay: 1000 } },
        { name: 'weezevent-sync', data: { type: 'weezevent', tenantId: 'tenant-3' }, opts: { delay: 2000 } },
      ]);
    });
  });

  describe('queueAnalytics', () => {
    it('should queue analytics with high priority for dashboard', async () => {
      const tenantId = 'tenant-123';
      const params = { startDate: '2026-01-01', endDate: '2026-01-20' };

      await service.queueAnalytics(tenantId, 'dashboard', params);

      expect(analyticsQueue.add).toHaveBeenCalledWith(
        'analytics-dashboard',
        { type: 'dashboard', tenantId, params },
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('should queue report with normal priority', async () => {
      const tenantId = 'tenant-123';
      const params = { metrics: ['revenue'] };

      await service.queueAnalytics(tenantId, 'report', params);

      expect(analyticsQueue.add).toHaveBeenCalledWith(
        'analytics-report',
        { type: 'report', tenantId, params },
        expect.objectContaining({ priority: 5 }),
      );
    });
  });

  describe('queueDashboardRefresh', () => {
    it('should queue dashboard refresh with highest priority', async () => {
      await service.queueDashboardRefresh('tenant-123', 'space-456');

      expect(analyticsQueue.add).toHaveBeenCalledWith(
        'analytics-dashboard',
        expect.objectContaining({ type: 'dashboard' }),
        expect.objectContaining({ priority: 1 }),
      );
    });
  });

  describe('queueNotification', () => {
    it('should queue email notification', async () => {
      const data = {
        type: 'email' as const,
        tenantId: 'tenant-123',
        userId: 'user-456',
        payload: { subject: 'Test', body: 'Hello' },
      };

      await service.queueNotification(data);

      expect(notificationsQueue.add).toHaveBeenCalledWith(
        'notification-email',
        data,
        undefined,
      );
    });

    it('should queue webhook notification', async () => {
      const data = {
        type: 'webhook' as const,
        tenantId: 'tenant-123',
        payload: { event: 'sync_completed' },
      };

      await service.queueWebhook(data.tenantId, data.payload);

      expect(notificationsQueue.add).toHaveBeenCalled();
    });
  });

  describe('queueExport', () => {
    it('should queue export job with low priority', async () => {
      const data = {
        type: 'csv' as const,
        tenantId: 'tenant-123',
        userId: 'user-456',
        reportType: 'sales',
        params: { dateRange: '30d' },
      };

      await service.queueExport(data);

      expect(exportsQueue.add).toHaveBeenCalledWith(
        'export-csv',
        data,
        expect.objectContaining({
          priority: 10,
          attempts: 2,
        }),
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return stats for a queue', async () => {
      const stats = await service.getQueueStats(QUEUES.DATA_SYNC);

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      });
    });

    it('should throw error for unknown queue', async () => {
      await expect(service.getQueueStats('unknown-queue')).rejects.toThrow(
        'Queue unknown-queue not found',
      );
    });
  });

  describe('getAllQueueStats', () => {
    it('should return stats for all queues', async () => {
      const allStats = await service.getAllQueueStats();

      expect(allStats).toHaveProperty(QUEUES.DATA_SYNC);
      expect(allStats).toHaveProperty(QUEUES.ANALYTICS);
      expect(allStats).toHaveProperty(QUEUES.NOTIFICATIONS);
      expect(allStats).toHaveProperty(QUEUES.EXPORTS);
    });
  });

  describe('pauseQueue', () => {
    it('should pause a queue', async () => {
      await service.pauseQueue(QUEUES.DATA_SYNC);

      expect(dataSyncQueue.pause).toHaveBeenCalled();
    });
  });

  describe('resumeQueue', () => {
    it('should resume a queue', async () => {
      await service.resumeQueue(QUEUES.DATA_SYNC);

      expect(dataSyncQueue.resume).toHaveBeenCalled();
    });
  });

  describe('retryFailedJobs', () => {
    it('should retry failed jobs', async () => {
      const mockFailedJobs = [
        { retry: jest.fn() },
        { retry: jest.fn() },
      ];
      dataSyncQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const count = await service.retryFailedJobs(QUEUES.DATA_SYNC);

      expect(count).toBe(2);
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
    });
  });
});
