import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { PrismaService } from '../../core/database/prisma.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';

describe('WebhookController', () => {
  let controller: WebhookController;
  let prisma: PrismaService;
  let signatureService: WebhookSignatureService;
  let eventHandler: WebhookEventHandler;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Organization',
    weezeventWebhookEnabled: true,
    weezeventWebhookSecret: 'secret-123',
  };

  const mockPayload = {
    type: 'transaction',
    method: 'create',
    data: {
      id: 'tx-123',
      amount: 100,
    },
  };

  const mockWebhookEvent = {
    id: 'event-123',
    tenantId: 'tenant-123',
    eventType: 'transaction',
    method: 'create',
    payload: mockPayload,
    signature: 'valid-signature',
    processed: false,
  };

  const mockIntegration = {
    id: 'integration-123',
    tenantId: 'tenant-123',
  };

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
    weezeventIntegration: {
      findUnique: jest.fn(),
    },
    weezeventWebhookEvent: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSignatureService = {
    validateSignature: jest.fn(),
  };

  const mockEventHandler = {
    processEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WebhookSignatureService,
          useValue: mockSignatureService,
        },
        {
          provide: WebhookEventHandler,
          useValue: mockEventHandler,
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    prisma = module.get<PrismaService>(PrismaService);
    signatureService = module.get<WebhookSignatureService>(WebhookSignatureService);
    eventHandler = module.get<WebhookEventHandler>(WebhookEventHandler);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('receiveWebhook', () => {
    it('should receive and store webhook event', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(true);
      mockPrismaService.weezeventWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

      const result = await controller.receiveWebhook(
        'tenant-123',
        'integration-123',
        'valid-signature',
        mockPayload as any,
      );

      expect(result).toEqual({
        received: true,
        eventId: 'event-123',
      });
      expect(mockPrismaService.weezeventWebhookEvent.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when tenant not found', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        controller.receiveWebhook('non-existent', 'integration-123', 'signature', mockPayload as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when webhooks disabled', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventWebhookEnabled: false,
      });

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', 'signature', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature missing', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', '', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature invalid', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockSignatureService.validateSignature.mockReturnValue(false);

      await expect(
        controller.receiveWebhook('tenant-123', 'integration-123', 'invalid-signature', mockPayload as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept webhook without signature when secret not configured', async () => {
      mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue(mockIntegration);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventWebhookSecret: null,
      });
      mockPrismaService.weezeventWebhookEvent.create.mockResolvedValue(mockWebhookEvent);

      const result = await controller.receiveWebhook(
        'tenant-123',
        'integration-123',
        '',
        mockPayload as any,
      );

      expect(result.received).toBe(true);
      expect(mockSignatureService.validateSignature).not.toHaveBeenCalled();
    });
  });
});
