import { Test, TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantPlan, TenantStatus } from '@prisma/client';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: TenantsService;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Organization',
    slug: 'test-org',
    domain: 'test.datafriday.io',
    plan: TenantPlan.PROFESSIONAL,
    status: TenantStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockTenantsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    getStatistics: jest.fn(),
    findBySlug: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    upgradePlan: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    service = module.get<TenantsService>(TenantsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a tenant', async () => {
      const createDto = {
        name: 'New Tenant',
        slug: 'new-tenant',
        ownerEmail: 'owner@test.com',
      };
      mockTenantsService.create.mockResolvedValue(mockTenant);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockTenant);
      expect(mockTenantsService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated tenants', async () => {
      const paginatedResult = {
        data: [mockTenant],
        meta: { total: 1, page: 1, limit: 10 },
      };
      mockTenantsService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll({});

      expect(result).toEqual(paginatedResult);
    });

    it('should apply filters', async () => {
      const query = {
        search: 'test',
        plan: TenantPlan.PROFESSIONAL,
        status: TenantStatus.ACTIVE,
      };
      mockTenantsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(query);

      expect(mockTenantsService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('getStatistics', () => {
    it('should return tenant statistics', async () => {
      const stats = {
        total: 100,
        active: 80,
        byPlan: { FREE: 50, PRO: 30, ENTERPRISE: 20 },
      };
      mockTenantsService.getStatistics.mockResolvedValue(stats);

      const result = await controller.getStatistics();

      expect(result).toEqual(stats);
    });
  });

  describe('findBySlug', () => {
    it('should return tenant by slug', async () => {
      mockTenantsService.findBySlug.mockResolvedValue(mockTenant);

      const result = await controller.findBySlug('test-org');

      expect(result).toEqual(mockTenant);
      expect(mockTenantsService.findBySlug).toHaveBeenCalledWith('test-org');
    });
  });

  describe('findOne', () => {
    it('should return tenant by id', async () => {
      mockTenantsService.findOne.mockResolvedValue(mockTenant);

      const result = await controller.findOne('tenant-123');

      expect(result).toEqual(mockTenant);
      expect(mockTenantsService.findOne).toHaveBeenCalledWith('tenant-123');
    });
  });

  describe('update', () => {
    it('should update a tenant', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedTenant = { ...mockTenant, ...updateDto };
      mockTenantsService.update.mockResolvedValue(updatedTenant);

      const result = await controller.update('tenant-123', updateDto);

      expect(result).toEqual(updatedTenant);
      expect(mockTenantsService.update).toHaveBeenCalledWith('tenant-123', updateDto);
    });
  });

  describe('suspend', () => {
    it('should suspend a tenant', async () => {
      const suspendedTenant = { ...mockTenant, status: TenantStatus.SUSPENDED };
      mockTenantsService.suspend.mockResolvedValue(suspendedTenant);

      const result = await controller.suspend('tenant-123');

      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a tenant', async () => {
      mockTenantsService.reactivate.mockResolvedValue(mockTenant);

      const result = await controller.reactivate('tenant-123');

      expect(result.status).toBe(TenantStatus.ACTIVE);
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade tenant plan', async () => {
      const upgradeDto = { plan: TenantPlan.ENTERPRISE };
      const upgradedTenant = { ...mockTenant, plan: TenantPlan.ENTERPRISE };
      mockTenantsService.upgradePlan.mockResolvedValue(upgradedTenant);

      const result = await controller.upgradePlan('tenant-123', upgradeDto);

      expect(result.plan).toBe(TenantPlan.ENTERPRISE);
    });
  });
});
