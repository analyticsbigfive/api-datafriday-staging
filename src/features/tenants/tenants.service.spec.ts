import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TenantPlan, TenantStatus } from '@prisma/client';

describe('TenantsService', () => {
  let service: TenantsService;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Company',
    slug: 'test-company',
    domain: 'test.example.com',
    logo: null,
    plan: TenantPlan.FREE,
    status: TenantStatus.ACTIVE,
    organizationType: 'Restaurant',
    siret: null,
    address: '123 Test St',
    city: 'Paris',
    postalCode: '75001',
    country: 'France',
    email: 'contact@test.com',
    phone: '+33123456789',
    numberOfEmployees: 10,
    numberOfSpaces: 2,
    paymentMethod: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    tenant: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = { name: 'New Company', slug: 'new-company' };

    it('should create a new tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      mockPrismaService.tenant.create.mockResolvedValue({ ...mockTenant, ...createDto });

      const result = await service.create(createDto);
      expect(result.name).toBe(createDto.name);
    });

    it('should throw ConflictException if slug exists', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated tenants', async () => {
      mockPrismaService.tenant.findMany.mockResolvedValue([mockTenant]);
      mockPrismaService.tenant.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by plan', async () => {
      mockPrismaService.tenant.findMany.mockResolvedValue([mockTenant]);
      mockPrismaService.tenant.count.mockResolvedValue(1);

      await service.findAll({ plan: TenantPlan.FREE });
      expect(mockPrismaService.tenant.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a tenant by ID', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, _count: { users: 5, spaces: 2 } });
      const result = await service.findOne('tenant-123');
      expect(result.id).toBe('tenant-123');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, _count: { users: 0, spaces: 0 } });
      mockPrismaService.tenant.findFirst.mockResolvedValue(null);
      mockPrismaService.tenant.update.mockResolvedValue({ ...mockTenant, name: 'Updated' });

      const result = await service.update('tenant-123', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should soft delete a tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, _count: { users: 0, spaces: 0 } });
      mockPrismaService.tenant.update.mockResolvedValue({ ...mockTenant, status: TenantStatus.CANCELLED });

      const result = await service.remove('tenant-123');
      expect(result.status).toBe(TenantStatus.CANCELLED);
    });

    it('should throw if already cancelled', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, status: TenantStatus.CANCELLED, _count: { users: 0, spaces: 0 } });
      await expect(service.remove('tenant-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade tenant plan', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, _count: { users: 0, spaces: 0 } });
      mockPrismaService.tenant.update.mockResolvedValue({ ...mockTenant, plan: TenantPlan.STARTER });

      const result = await service.upgradePlan('tenant-123', { plan: TenantPlan.STARTER });
      expect(result.plan).toBe(TenantPlan.STARTER);
    });

    it('should throw on downgrade attempt', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, plan: TenantPlan.PROFESSIONAL, _count: { users: 0, spaces: 0 } });
      await expect(service.upgradePlan('tenant-123', { plan: TenantPlan.STARTER })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUsage', () => {
    it('should return usage statistics', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        name: 'Test',
        plan: TenantPlan.STARTER,
        _count: { users: 5, spaces: 2, weezeventEvents: 10, weezeventTransactions: 100 },
      });

      const result = await service.getUsage('tenant-123');
      expect(result.usage.users.current).toBe(5);
    });
  });

  describe('suspend', () => {
    it('should suspend a tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, _count: { users: 0, spaces: 0 } });
      mockPrismaService.tenant.update.mockResolvedValue({ ...mockTenant, status: TenantStatus.SUSPENDED });

      const result = await service.suspend('tenant-123');
      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a suspended tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, status: TenantStatus.SUSPENDED, _count: { users: 0, spaces: 0 } });
      mockPrismaService.tenant.update.mockResolvedValue({ ...mockTenant, status: TenantStatus.ACTIVE });

      const result = await service.reactivate('tenant-123');
      expect(result.status).toBe(TenantStatus.ACTIVE);
    });
  });

  describe('getStatistics', () => {
    it('should return tenant statistics', async () => {
      mockPrismaService.tenant.count.mockResolvedValue(10);
      mockPrismaService.tenant.groupBy.mockResolvedValue([{ plan: TenantPlan.FREE, _count: { plan: 5 } }]);
      mockPrismaService.tenant.findMany.mockResolvedValue([mockTenant]);

      const result = await service.getStatistics();
      expect(result.total).toBe(10);
    });
  });
});
