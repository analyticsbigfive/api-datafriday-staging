import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WeezeventIntegrationService } from './weezevent-integration.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';

describe('WeezeventIntegrationService', () => {
  let service: WeezeventIntegrationService;
  let prisma: PrismaService;
  let encryptionService: EncryptionService;

  const mockTenant = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    weezeventClientId: 'client-123',
    weezeventOrganizationId: 'weez-org-456',
    weezeventEnabled: true,
  };

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue('encrypted-secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeezeventIntegrationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    service = module.get<WeezeventIntegrationService>(WeezeventIntegrationService);
    prisma = module.get<PrismaService>(PrismaService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateConfig', () => {
    it('should update Weezevent configuration', async () => {
      const config = {
        weezeventClientId: 'new-client-id',
        weezeventOrganizationId: 'new-org-id',
        weezeventEnabled: true,
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue({
        ...mockTenant,
        ...config,
      });

      const result = await service.updateConfig('org-123', config);

      expect(result.weezeventClientId).toBe('new-client-id');
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: expect.objectContaining({
          weezeventClientId: 'new-client-id',
          weezeventOrganizationId: 'new-org-id',
          weezeventEnabled: true,
        }),
        select: expect.any(Object),
      });
    });

    it('should encrypt client secret when provided', async () => {
      const config = {
        weezeventClientSecret: 'my-secret',
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue(mockTenant);

      await service.updateConfig('org-123', config);

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('my-secret');
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: expect.objectContaining({
          weezeventClientSecret: 'encrypted-secret',
        }),
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.updateConfig('non-existent', { weezeventClientId: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConfig', () => {
    it('should return Weezevent configuration', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.getConfig('org-123');

      expect(result).toEqual({
        clientId: 'client-123',
        organizationId: 'weez-org-456',
        enabled: true,
        configured: true,
      });
    });

    it('should return configured false when no clientId', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        weezeventClientId: null,
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
