import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhookIntegrationService } from './webhook-integration.service';
import { PrismaService } from '../../../core/database/prisma.service';

describe('WebhookIntegrationService', () => {
  let service: WebhookIntegrationService;
  let prisma: PrismaService;

  const mockTenant = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    weezeventWebhookEnabled: true,
    weezeventWebhookSecret: 'webhook-secret',
  };

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookIntegrationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WebhookIntegrationService>(WebhookIntegrationService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateConfig', () => {
    it('should update webhook configuration', async () => {
      const config = {
        weezeventWebhookSecret: 'new-secret',
        weezeventWebhookEnabled: true,
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
        slug: 'test-org',
        weezeventWebhookEnabled: true,
      });

      const result = await service.updateConfig('org-123', config);

      expect(result.weezeventWebhookEnabled).toBe(true);
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: {
          weezeventWebhookSecret: 'new-secret',
          weezeventWebhookEnabled: true,
        },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.updateConfig('non-existent', { weezeventWebhookEnabled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConfig', () => {
    it('should return webhook configuration', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
        weezeventWebhookEnabled: true,
      });

      const result = await service.getConfig('org-123');

      expect(result).toEqual({
        enabled: true,
        configured: true,
      });
    });

    it('should return configured false when webhooks disabled', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
        weezeventWebhookEnabled: false,
      });

      const result = await service.getConfig('org-123');

      expect(result.configured).toBe(false);
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getConfig('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
