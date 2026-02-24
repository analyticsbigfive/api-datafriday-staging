import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../database/prisma.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('WebhooksService', () => {
  let service: WebhooksService;

  const mockWebhook = {
    id: 'wh-1',
    tenantId: 'tenant-1',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    events: ['event.created', 'event.updated'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    webhook: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    webhookLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWebhook', () => {
    it('should create a webhook', async () => {
      const dto = { url: 'https://example.com/hook', events: ['event.created'] };
      mockPrisma.webhook.create.mockResolvedValue({ ...mockWebhook, ...dto });

      const result = await service.createWebhook('tenant-1', dto as any);
      expect(result.url).toBe('https://example.com/hook');
      expect(mockPrisma.webhook.create).toHaveBeenCalled();
    });
  });

  describe('getWebhooks', () => {
    it('should return webhooks for tenant', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([mockWebhook]);

      const result = await service.getWebhooks('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('tenant-1');
    });

    it('should return empty array for no webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      const result = await service.getWebhooks('tenant-2');
      expect(result).toEqual([]);
    });
  });

  describe('updateWebhook', () => {
    it('should update a webhook', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue(mockWebhook);
      mockPrisma.webhook.update.mockResolvedValue({ ...mockWebhook, url: 'https://new.com/hook' });

      const result = await service.updateWebhook('wh-1', 'tenant-1', { url: 'https://new.com/hook' } as any);
      expect(result.url).toBe('https://new.com/hook');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue(mockWebhook);
      mockPrisma.webhook.delete.mockResolvedValue(mockWebhook);

      await service.deleteWebhook('wh-1', 'tenant-1');
      expect(mockPrisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
    });
  });

  describe('dispatchEvent', () => {
    it('should dispatch to active webhooks matching event', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([mockWebhook]);
      const axiosResponse: Partial<AxiosResponse> = { status: 200, data: 'ok' };
      mockHttpService.post.mockReturnValue(of(axiosResponse));
      mockPrisma.webhookLog.create.mockResolvedValue({});

      await service.dispatchEvent('tenant-1', 'event.created', { id: 'evt-1' });

      expect(mockHttpService.post).toHaveBeenCalled();
      expect(mockPrisma.webhookLog.create).toHaveBeenCalled();
    });

    it('should not dispatch to inactive webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      await service.dispatchEvent('tenant-1', 'event.created', { id: 'evt-1' });

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should log failures gracefully', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([mockWebhook]);
      mockHttpService.post.mockReturnValue(throwError(() => new Error('Network error')));
      mockPrisma.webhookLog.create.mockResolvedValue({});

      await service.dispatchEvent('tenant-1', 'event.created', { id: 'evt-1' });

      expect(mockPrisma.webhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: false }),
        }),
      );
    });
  });

  describe('getWebhookLogs', () => {
    it('should return logs for a webhook', async () => {
      const logs = [{ id: 'log-1', webhookId: 'wh-1', success: true }];
      mockPrisma.webhookLog.findMany.mockResolvedValue(logs);

      const result = await service.getWebhookLogs('wh-1');
      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
    });
  });
});
