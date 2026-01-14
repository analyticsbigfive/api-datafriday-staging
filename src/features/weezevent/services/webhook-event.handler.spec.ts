import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventHandler } from './webhook-event.handler';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';

describe('WebhookEventHandler', () => {
  let handler: WebhookEventHandler;
  let prisma: PrismaService;
  let syncService: WeezeventSyncService;

  const mockWebhookEvent = {
    id: 'event-123',
    tenantId: 'tenant-123',
    eventType: 'transaction',
    method: 'create',
    payload: {
      type: 'transaction',
      method: 'create',
      data: { id: 'tx-123' },
    },
    processed: false,
    tenant: {
      id: 'tenant-123',
      weezeventOrganizationId: 'weez-org-123',
    },
  };

  const mockTenant = {
    id: 'tenant-123',
    weezeventEnabled: true,
    weezeventOrganizationId: 'weez-org-123',
  };

  const mockPrismaService = {
    weezeventWebhookEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    weezeventTransaction: {
      update: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  };

  const mockSyncService = {
    syncTransactions: jest.fn(),
    syncSingleTransaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventHandler,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WeezeventSyncService,
          useValue: mockSyncService,
        },
      ],
    }).compile();

    handler = module.get<WebhookEventHandler>(WebhookEventHandler);
    prisma = module.get<PrismaService>(PrismaService);
    syncService = module.get<WeezeventSyncService>(WeezeventSyncService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('processEvent', () => {
    it('should process transaction create event', async () => {
      mockPrismaService.weezeventWebhookEvent.findUnique.mockResolvedValue(mockWebhookEvent);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.weezeventWebhookEvent.update.mockResolvedValue({
        ...mockWebhookEvent,
        processed: true,
      });
      mockSyncService.syncSingleTransaction.mockResolvedValue({ success: true });

      await handler.processEvent('event-123');

      expect(mockPrismaService.weezeventWebhookEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        include: { tenant: true },
      });
    });

    it('should skip already processed events', async () => {
      mockPrismaService.weezeventWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        processed: true,
      });

      await handler.processEvent('event-123');

      expect(mockPrismaService.weezeventWebhookEvent.update).not.toHaveBeenCalled();
    });

    it('should handle event not found', async () => {
      mockPrismaService.weezeventWebhookEvent.findUnique.mockResolvedValue(null);

      await handler.processEvent('non-existent');

      expect(mockPrismaService.weezeventWebhookEvent.update).not.toHaveBeenCalled();
    });

    it('should update error on failure', async () => {
      mockPrismaService.weezeventWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        payload: { type: 'transaction', method: 'create', data: {} }, // Missing ID
      });

      await expect(handler.processEvent('event-123')).rejects.toThrow();

      expect(mockPrismaService.weezeventWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        data: expect.objectContaining({
          error: expect.any(String),
          retryCount: { increment: 1 },
        }),
      });
    });

    it('should handle unknown event type', async () => {
      mockPrismaService.weezeventWebhookEvent.findUnique.mockResolvedValue({
        ...mockWebhookEvent,
        eventType: 'unknown',
      });
      mockPrismaService.weezeventWebhookEvent.update.mockResolvedValue({});

      await handler.processEvent('event-123');

      // Should still mark as processed even for unknown types
      expect(mockPrismaService.weezeventWebhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-123' },
        data: expect.objectContaining({
          processed: true,
        }),
      });
    });
  });
});
