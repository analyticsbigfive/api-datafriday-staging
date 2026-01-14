import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: PrismaService;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    domain: 'test.datafriday.io',
    logo: 'https://example.com/logo.png',
    plan: 'PRO',
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
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
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrganization', () => {
    it('should return an organization', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockOrganization);

      const result = await service.getOrganization('org-123');

      expect(result).toEqual(mockOrganization);
      expect(mockPrismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
        }),
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getOrganization('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOrganization('non-existent')).rejects.toThrow(
        'Organization non-existent not found',
      );
    });
  });

  describe('updateOrganization', () => {
    const updateDto = {
      name: 'Updated Organization',
      domain: 'updated.datafriday.io',
    };

    it('should update an organization', async () => {
      const updatedOrg = { ...mockOrganization, ...updateDto };
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockOrganization);
      mockPrismaService.tenant.update.mockResolvedValue(updatedOrg);

      const result = await service.updateOrganization('org-123', updateDto);

      expect(result).toEqual(updatedOrg);
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: updateDto,
        select: expect.objectContaining({
          id: true,
          name: true,
        }),
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrganization('non-existent', updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOrganization', () => {
    it('should soft delete an organization', async () => {
      const deletedOrg = {
        id: 'org-123',
        name: 'Test Organization',
        status: 'SUSPENDED',
      };
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockOrganization);
      mockPrismaService.tenant.update.mockResolvedValue(deletedOrg);

      const result = await service.deleteOrganization('org-123');

      expect(result.status).toBe('SUSPENDED');
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: { status: 'SUSPENDED' },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.deleteOrganization('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
