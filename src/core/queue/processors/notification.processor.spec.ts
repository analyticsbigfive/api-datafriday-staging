import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { NotificationProcessor } from './notification.processor';
import { NotificationJobData } from '../queue.service';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationProcessor],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process email notification', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'notification-email',
        data: {
          type: 'email',
          tenantId: 'tenant-123',
          userId: 'user-456',
          payload: {
            subject: 'Test Email',
            body: 'Hello World',
          },
        },
      } as unknown as Job<NotificationJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-456',
        type: 'email',
        sentAt: expect.any(String),
        status: 'sent',
      });
    });

    it('should process webhook notification', async () => {
      const mockJob = {
        id: 'job-124',
        name: 'notification-webhook',
        data: {
          type: 'webhook',
          tenantId: 'tenant-123',
          payload: {
            event: 'sync_completed',
            data: { items: 100 },
          },
        },
      } as unknown as Job<NotificationJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        type: 'webhook',
        deliveredAt: expect.any(String),
        status: 'delivered',
      });
    });

    it('should process push notification', async () => {
      const mockJob = {
        id: 'job-125',
        name: 'notification-push',
        data: {
          type: 'push',
          tenantId: 'tenant-123',
          userId: 'user-789',
          payload: {
            title: 'Sync Complete',
            message: 'Your data has been synchronized',
          },
        },
      } as unknown as Job<NotificationJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-789',
        type: 'push',
        sentAt: expect.any(String),
        status: 'sent',
      });
    });

    it('should throw error for unknown notification type', async () => {
      const mockJob = {
        id: 'job-126',
        name: 'notification-unknown',
        data: {
          type: 'unknown' as any,
          tenantId: 'tenant-123',
          payload: {},
        },
      } as unknown as Job<NotificationJobData>;

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Unknown notification type: unknown',
      );
    });
  });

  describe('event handlers', () => {
    it('should log on job completed', () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');
      const mockJob = {
        id: 'job-127',
        data: {
          type: 'email',
          tenantId: 'tenant-123',
        },
      } as unknown as Job<NotificationJobData>;

      processor.onCompleted(mockJob);

      expect(logSpy).toHaveBeenCalledWith(
        'Notification job job-127 completed',
      );
    });

    it('should log on job failed', () => {
      const errorSpy = jest.spyOn(processor['logger'], 'error');
      const mockJob = {
        id: 'job-128',
        data: {
          type: 'webhook',
          tenantId: 'tenant-123',
        },
      } as unknown as Job<NotificationJobData>;
      const error = new Error('Webhook delivery failed');

      processor.onFailed(mockJob, error);

      expect(errorSpy).toHaveBeenCalledWith(
        'Notification job job-128 failed: Webhook delivery failed',
      );
    });
  });
});
