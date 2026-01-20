import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService, ProcessingContext } from './orchestrator.service';
import { RedisService } from '../../core/redis/redis.service';
import { QueueService } from '../../core/queue/queue.service';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let redisService: jest.Mocked<RedisService>;
  let queueService: jest.Mocked<QueueService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      deletePattern: jest.fn(),
      ping: jest.fn(),
    };

    const mockQueueService = {
      queueWeezeventSync: jest.fn().mockResolvedValue({ id: 'job-123' }),
      queueAnalytics: jest.fn().mockResolvedValue({ id: 'job-456' }),
      getAllQueueStats: jest.fn().mockResolvedValue({
        'data-sync': { waiting: 0, active: 0, completed: 10, failed: 0 },
        'analytics': { waiting: 1, active: 0, completed: 5, failed: 0 },
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-key',
          SUPABASE_ANON_KEY: 'test-anon-key',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    redisService = module.get(RedisService);
    queueService = module.get(QueueService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('decideStrategy', () => {
    it('should return sync for small datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('sync');
      expect(decision.reason).toContain('Small dataset');
    });

    it('should return queue for medium datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 10000,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('queue');
      expect(decision.reason).toContain('Medium dataset');
    });

    it('should return edge for large datasets', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 100000,
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('edge');
      expect(decision.reason).toContain('Large dataset');
    });

    it('should prioritize sync for high priority with small data', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: 800,
        priority: 'high',
      };

      const decision = service.decideStrategy(context);

      expect(decision.strategy).toBe('sync');
      expect(decision.reason).toContain('High priority');
    });

    it('should estimate duration based on items', () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };

      const decision = service.decideStrategy(context);

      expect(decision.estimatedDuration).toBe(1000); // 500 * 2ms
    });
  });

  describe('processSync', () => {
    it('should process synchronously for small datasets', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };
      const syncFn = jest.fn().mockResolvedValue({ synced: true });
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const result = await service.processSync(context, syncFn);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('sync');
      expect(syncFn).toHaveBeenCalled();
    });

    it('should return cached data when available', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
      };
      const cachedData = { cached: true };
      redisService.get.mockResolvedValue(cachedData);

      const syncFn = jest.fn();
      const result = await service.processSync(context, syncFn);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.data).toEqual(cachedData);
      expect(syncFn).not.toHaveBeenCalled();
    });

    it('should queue for medium datasets', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 10000,
      };
      const syncFn = jest.fn();

      const result = await service.processSync(context, syncFn);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('queue');
      expect(result.jobId).toBe('job-123');
      expect(queueService.queueWeezeventSync).toHaveBeenCalled();
    });
  });

  describe('processAnalytics', () => {
    it('should return cached analytics when available', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: 500,
      };
      const cachedData = { revenue: 10000 };
      redisService.get.mockResolvedValue(cachedData);

      const computeFn = jest.fn();
      const result = await service.processAnalytics(context, computeFn);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.data).toEqual(cachedData);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should compute and cache analytics when not cached', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: 500,
      };
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const computedData = { revenue: 20000 };
      const computeFn = jest.fn().mockResolvedValue(computedData);
      const result = await service.processAnalytics(context, computeFn);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.data).toEqual(computedData);
      expect(computeFn).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should queue for large analytics datasets', async () => {
      const context: ProcessingContext = {
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: 50000,
      };
      redisService.get.mockResolvedValue(null);

      const computeFn = jest.fn();
      const result = await service.processAnalytics(context, computeFn);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('queue');
      expect(result.jobId).toBeDefined();
    });
  });

  describe('getDashboardData', () => {
    it('should return cached dashboard data', async () => {
      const cachedDashboard = { totalSales: 5000 };
      redisService.get.mockResolvedValue(cachedDashboard);

      const fetchFn = jest.fn();
      const result = await service.getDashboardData('tenant-123', 'space-456', fetchFn);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.data).toEqual(cachedDashboard);
    });

    it('should fetch and cache dashboard data when not cached', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const dashboardData = { totalSales: 7500 };
      const fetchFn = jest.fn().mockResolvedValue(dashboardData);
      const result = await service.getDashboardData('tenant-123', 'space-456', fetchFn);

      expect(result.success).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.data).toEqual(dashboardData);
      expect(redisService.set).toHaveBeenCalledWith(
        'dashboard:tenant-123:space-456',
        dashboardData,
        expect.objectContaining({ ttl: 60 }),
      );
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all cache for a tenant', async () => {
      redisService.deletePattern.mockResolvedValue(5);

      await service.invalidateCache('tenant-123');

      expect(redisService.deletePattern).toHaveBeenCalledWith('*:tenant-123:*');
    });

    it('should invalidate cache for specific space', async () => {
      redisService.deletePattern.mockResolvedValue(2);

      await service.invalidateCache('tenant-123', 'space-456');

      expect(redisService.deletePattern).toHaveBeenCalledWith('*:tenant-123:space-456*');
    });
  });

  describe('healthCheck', () => {
    it('should return health status of all services', async () => {
      redisService.ping.mockResolvedValue(true);

      // Mock fetch for edge function health check
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
      });

      const health = await service.healthCheck();

      expect(health.redis).toBe(true);
      expect(health.queues).toBeDefined();
    });

    it('should handle Redis being down', async () => {
      redisService.ping.mockResolvedValue(false);

      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const health = await service.healthCheck();

      expect(health.redis).toBe(false);
    });
  });
});
