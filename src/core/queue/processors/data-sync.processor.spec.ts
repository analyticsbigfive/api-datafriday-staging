import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSyncProcessor } from './data-sync.processor';
import { WeezeventSyncService } from '../../../features/weezevent/services/weezevent-sync.service';
import { RedisService } from '../../redis/redis.service';

describe('DataSyncProcessor', () => {
  let processor: DataSyncProcessor;
  let weezeventSyncService: jest.Mocked<WeezeventSyncService>;
  let redisService: jest.Mocked<RedisService>;

  const mockWeezeventSyncService = {
    syncTransactions: jest.fn().mockResolvedValue({
      type: 'transactions',
      success: true,
      itemsSynced: 100,
      itemsCreated: 50,
      itemsUpdated: 50,
      errors: 0,
      duration: 1000,
    }),
    syncEvents: jest.fn().mockResolvedValue({
      type: 'events',
      success: true,
      itemsSynced: 10,
      itemsCreated: 5,
      itemsUpdated: 5,
      errors: 0,
      duration: 500,
    }),
    syncProducts: jest.fn().mockResolvedValue({
      type: 'products',
      success: true,
      itemsSynced: 20,
      itemsCreated: 10,
      itemsUpdated: 10,
      errors: 0,
      duration: 300,
    }),
  };

  const mockRedisService = {
    deletePattern: jest.fn().mockResolvedValue(5),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataSyncProcessor,
        { provide: WeezeventSyncService, useValue: mockWeezeventSyncService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    processor = module.get<DataSyncProcessor>(DataSyncProcessor);
    weezeventSyncService = module.get(WeezeventSyncService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process weezevent sync job with real service', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'weezevent-sync',
        data: {
          type: 'weezevent',
          tenantId: 'tenant-123',
          options: { fullSync: false },
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        syncedAt: expect.any(String),
        fullSync: false,
        status: 'completed',
        results: {
          transactions: expect.any(Object),
          events: expect.any(Object),
          products: expect.any(Object),
        },
      });
      expect(weezeventSyncService.syncTransactions).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ full: false }),
      );
      expect(weezeventSyncService.syncEvents).toHaveBeenCalledWith('tenant-123');
      expect(weezeventSyncService.syncProducts).toHaveBeenCalledWith('tenant-123');
      expect(redisService.deletePattern).toHaveBeenCalled();
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process full sync with correct flag', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'weezevent-sync',
        data: {
          type: 'weezevent',
          tenantId: 'tenant-123',
          options: { fullSync: true },
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result.fullSync).toBe(true);
      expect(weezeventSyncService.syncTransactions).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({ full: true }),
      );
    });

    it('should handle stripe sync type', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'stripe-sync',
        data: {
          type: 'stripe',
          tenantId: 'tenant-123',
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result.status).toBe('not_implemented');
    });

    it('should handle manual sync type', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'manual-sync',
        data: {
          type: 'manual',
          tenantId: 'tenant-123',
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result.status).toBe('completed');
    });

    it('should throw error for unknown sync type', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'unknown-sync',
        data: {
          type: 'unknown',
          tenantId: 'tenant-123',
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Unknown sync type: unknown',
      );
    });

    it('should update progress throughout sync', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'weezevent-sync',
        data: {
          type: 'weezevent',
          tenantId: 'tenant-123',
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(mockJob);

      // Should call updateProgress multiple times (updated for real service integration)
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(20);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(70);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(90);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should invalidate cache after sync', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'weezevent-sync',
        data: {
          type: 'weezevent',
          tenantId: 'tenant-123',
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(mockJob);

      // Should invalidate cache patterns for the tenant
      expect(redisService.deletePattern).toHaveBeenCalledWith('dashboard:tenant-123:*');
      expect(redisService.deletePattern).toHaveBeenCalledWith('analytics:tenant-123:*');
      expect(redisService.deletePattern).toHaveBeenCalledWith('weezevent:tenant-123:*');
    });
  });
});
