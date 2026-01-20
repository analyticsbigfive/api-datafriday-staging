import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { AnalyticsProcessor } from './analytics.processor';

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsProcessor],
    }).compile();

    processor = module.get<AnalyticsProcessor>(AnalyticsProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process dashboard analytics', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'analytics-dashboard',
        data: {
          type: 'dashboard',
          tenantId: 'tenant-123',
          params: {
            startDate: '2026-01-01',
            endDate: '2026-01-20',
          },
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        computedAt: expect.any(String),
        metrics: expect.objectContaining({
          revenue: expect.any(Object),
          transactions: expect.any(Object),
          items: expect.any(Object),
        }),
      });
    });

    it('should process report analytics', async () => {
      const mockJob = {
        id: 'job-456',
        name: 'analytics-report',
        data: {
          type: 'report',
          tenantId: 'tenant-123',
          params: { metrics: ['revenue'] },
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result.status).toBe('completed');
      expect(result.generatedAt).toBeDefined();
    });

    it('should process aggregation analytics', async () => {
      const mockJob = {
        id: 'job-789',
        name: 'analytics-aggregation',
        data: {
          type: 'aggregation',
          tenantId: 'tenant-123',
          params: { groupBy: 'day' },
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      const result = await processor.process(mockJob);

      expect(result.status).toBe('completed');
      expect(result.groupBy).toBe('day');
    });

    it('should throw error for unknown analytics type', async () => {
      const mockJob = {
        id: 'job-000',
        name: 'analytics-unknown',
        data: {
          type: 'unknown',
          tenantId: 'tenant-123',
          params: {},
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Unknown analytics type: unknown',
      );
    });

    it('should update progress during processing', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'analytics-dashboard',
        data: {
          type: 'dashboard',
          tenantId: 'tenant-123',
          params: {},
        },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(mockJob);

      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });
  });
});
