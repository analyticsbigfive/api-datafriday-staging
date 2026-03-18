import { Test, TestingModule } from '@nestjs/testing';
import { SpacesService } from './spaces.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('SpacesService', () => {
  let service: SpacesService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    space: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    userPinnedSpace: {
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    userSpaceAccess: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    config: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpacesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SpacesService>(SpacesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new space', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        name: 'Test Space',
        image: 'https://example.com/image.jpg',
      };

      const mockSpace = {
        id: 'space-abc123',
        name: dto.name,
        image: dto.image,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: tenantId,
          name: 'Test Tenant',
          slug: 'test-tenant',
        },
      };

      mockPrismaService.space.create.mockResolvedValue(mockSpace);

      const result = await service.create(tenantId, dto);

      expect(result).toEqual(mockSpace);
      expect(mockPrismaService.space.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name,
          image: dto.image,
          tenantId,
        }),
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated spaces', async () => {
      const tenantId = 'tenant-123';
      const query = { page: 1, limit: 10 };

      const mockSpaces = [
        {
          id: 'space-1',
          name: 'Space 1',
          tenantId,
          _count: { configs: 2, pinnedByUsers: 1 },
        },
        {
          id: 'space-2',
          name: 'Space 2',
          tenantId,
          _count: { configs: 0, pinnedByUsers: 0 },
        },
      ];

      mockPrismaService.space.findMany.mockResolvedValue(mockSpaces);
      mockPrismaService.space.count.mockResolvedValue(2);

      const result = await service.findAll(tenantId, query);

      expect(result.data).toEqual(mockSpaces);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter spaces by search term', async () => {
      const tenantId = 'tenant-123';
      const query = { search: 'Test', page: 1, limit: 10 };

      mockPrismaService.space.findMany.mockResolvedValue([]);
      mockPrismaService.space.count.mockResolvedValue(0);

      await service.findAll(tenantId, query);

      expect(mockPrismaService.space.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            name: {
              contains: 'Test',
              mode: 'insensitive',
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a space by id', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
        tenant: { id: tenantId, name: 'Test Tenant', slug: 'test-tenant' },
        configs: [],
        _count: { pinnedByUsers: 0, userAccess: 0 },
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);

      const result = await service.findOne(spaceId, tenantId);

      expect(result).toEqual(mockSpace);
    });

    it('should throw NotFoundException if space not found', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';

      mockPrismaService.space.findFirst.mockResolvedValue(null);

      await expect(service.findOne(spaceId, tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';
      const dto = { name: 'Updated Name' };

      const mockSpace = {
        id: spaceId,
        name: 'Old Name',
        tenantId,
      };

      const updatedSpace = {
        ...mockSpace,
        name: dto.name,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.update.mockResolvedValue(updatedSpace);

      const result = await service.update(spaceId, tenantId, dto);

      expect(result.name).toBe(dto.name);
      expect(mockPrismaService.space.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.delete.mockResolvedValue(mockSpace);

      const result = await service.remove(spaceId, tenantId);

      expect(result.message).toBe('Space deleted successfully');
      expect(mockPrismaService.space.delete).toHaveBeenCalledWith({
        where: { id: spaceId },
      });
    });
  });

  describe('pin', () => {
    it('should pin a space for a user', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const mockPinned = {
        id: 'pin-123',
        userId,
        spaceId,
        space: { id: spaceId, name: 'Test Space', image: null },
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(null);
      mockPrismaService.userPinnedSpace.create.mockResolvedValue(mockPinned);

      const result = await service.pin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space pinned successfully');
      expect(result.pinned).toEqual(mockPinned);
    });

    it('should return message if already pinned', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const existingPin = { id: 'pin-123', userId, spaceId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(existingPin);

      const result = await service.pin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space already pinned');
    });
  });

  describe('unpin', () => {
    it('should unpin a space for a user', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const existingPin = { id: 'pin-123', userId, spaceId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(existingPin);
      mockPrismaService.userPinnedSpace.delete.mockResolvedValue(existingPin);

      const result = await service.unpin(spaceId, userId, tenantId);

      expect(result.message).toBe('Space unpinned successfully');
    });

    it('should throw NotFoundException if not pinned', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.userPinnedSpace.findUnique.mockResolvedValue(null);

      await expect(service.unpin(spaceId, userId, tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('grantAccess', () => {
    it('should grant user access to a space', async () => {
      const spaceId = 'space-123';
      const userId = 'user-123';
      const role = 'STAFF';
      const tenantId = 'tenant-123';

      const mockSpace = { id: spaceId, name: 'Test Space', tenantId };
      const mockUser = { id: userId, email: 'user@test.com', tenantId };
      const mockAccess = {
        id: 'access-123',
        userId,
        spaceId,
        role,
        user: mockUser,
        space: mockSpace,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userSpaceAccess.findUnique.mockResolvedValue(null);
      mockPrismaService.userSpaceAccess.create.mockResolvedValue(mockAccess);

      const result = await service.grantAccess(spaceId, userId, role, tenantId);

      expect(result).toEqual(mockAccess);
    });
  });

  describe('getStatistics', () => {
    it('should return space statistics', async () => {
      const tenantId = 'tenant-123';

      mockPrismaService.space.count.mockResolvedValue(5);
      mockPrismaService.config.count.mockResolvedValue(12);
      mockPrismaService.space.findMany.mockResolvedValue([
        { id: 'space-1', name: 'Space 1', image: null, createdAt: new Date() },
      ]);

      const result = await service.getStatistics(tenantId);

      expect(result.totalSpaces).toBe(5);
      expect(result.totalConfigs).toBe(12);
      expect(result.recentSpaces).toHaveLength(1);
    });
  });

  describe('updateImage', () => {
    it('should update space image', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';
      const image = 'data:image/png;base64,iVBORw0KGgo...';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      const updatedSpace = {
        id: spaceId,
        name: 'Test Space',
        image,
        updatedAt: new Date(),
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.space.update.mockResolvedValue(updatedSpace);

      const result = await service.updateImage(spaceId, tenantId, image);

      expect(result.image).toBe(image);
      expect(mockPrismaService.space.update).toHaveBeenCalledWith({
        where: { id: spaceId },
        data: { image },
        select: {
          id: true,
          name: true,
          image: true,
          updatedAt: true,
        },
      });
    });

    it('should throw NotFoundException if space not found', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';
      const image = 'data:image/png;base64,iVBORw0KGgo...';

      mockPrismaService.space.findFirst.mockResolvedValue(null);

      await expect(service.updateImage(spaceId, tenantId, image)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getConfigurations', () => {
    it('should return configurations for a space', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      const mockConfigurations = [
        {
          id: 'config-1',
          name: 'Config 1',
          spaceId,
          capacity: 1000,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { floors: 3, stations: 5 },
        },
        {
          id: 'config-2',
          name: 'Config 2',
          spaceId,
          capacity: 500,
          data: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { floors: 2, stations: 3 },
        },
      ];

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.config.findMany.mockResolvedValue(mockConfigurations);

      const result = await service.getConfigurations(spaceId, tenantId);

      expect(result).toEqual(mockConfigurations);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.config.findMany).toHaveBeenCalledWith({
        where: {
          spaceId,
          space: {
            tenantId,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          capacity: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              floors: true,
              stations: true,
            },
          },
        },
      });
    });

    it('should return empty array if no accessible configurations exist for the tenant', async () => {
      const spaceId = 'non-existent';
      const tenantId = 'tenant-123';

      mockPrismaService.config.findMany.mockResolvedValue([]);

      await expect(service.getConfigurations(spaceId, tenantId)).resolves.toEqual([]);
    });

    it('should return empty array if no configurations', async () => {
      const spaceId = 'space-123';
      const tenantId = 'tenant-123';

      const mockSpace = {
        id: spaceId,
        name: 'Test Space',
        tenantId,
      };

      mockPrismaService.space.findFirst.mockResolvedValue(mockSpace);
      mockPrismaService.config.findMany.mockResolvedValue([]);

      const result = await service.getConfigurations(spaceId, tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('getConfiguration', () => {
    it('should return a configuration only if it belongs to the tenant', async () => {
      mockPrismaService.config.findFirst.mockResolvedValue({
        id: 'config-1',
        name: 'Config 1',
        spaceId: 'space-1',
        capacity: 100,
        data: { floors: [], forecourt: null },
        createdAt: new Date(),
        updatedAt: new Date(),
        space: { id: 'space-1', name: 'Space 1', tenantId: 'tenant-123' },
      });

      const result = await service.getConfiguration('config-1', 'tenant-123');

      expect(result.spaceId).toBe('space-1');
      expect(mockPrismaService.config.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'config-1',
            space: { tenantId: 'tenant-123' },
          },
        }),
      );
    });

    it('should throw NotFoundException when configuration is not accessible for tenant', async () => {
      mockPrismaService.config.findFirst.mockResolvedValue(null);

      await expect(service.getConfiguration('config-404', 'tenant-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('saveConfiguration', () => {
    it('should reject updating a configuration tied to another space', async () => {
      mockPrismaService.space.findFirst.mockResolvedValue({ id: 'space-1', tenantId: 'tenant-123' });
      mockPrismaService.config.findFirst.mockResolvedValue({
        id: 'config-1',
        name: 'Config 1',
        spaceId: 'space-2',
        capacity: 100,
        data: { floors: [], forecourt: null },
        createdAt: new Date(),
        updatedAt: new Date(),
        space: { id: 'space-2', name: 'Space 2', tenantId: 'tenant-123' },
      });

      await expect(
        service.saveConfiguration(
          {
            id: 'config-1',
            name: 'Updated config',
            spaceId: 'space-1',
            capacity: 100,
            data: { floors: [], forecourt: null },
          },
          'tenant-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setPinnedSpaces', () => {
    it('should set pinned spaces for a user', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds = ['space-1', 'space-2'];

      const validSpaces = [
        { id: 'space-1' },
        { id: 'space-2' },
      ];

      const pinnedSpaces = [
        {
          id: 'space-1',
          name: 'Space 1',
          image: null,
          _count: { configs: 2 },
        },
        {
          id: 'space-2',
          name: 'Space 2',
          image: null,
          _count: { configs: 1 },
        },
      ];

      mockPrismaService.space.findMany
        .mockResolvedValueOnce(validSpaces) // For validation
        .mockResolvedValueOnce(pinnedSpaces); // For getPinned
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userPinnedSpace.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue(
        pinnedSpaces.map((s) => ({ space: s })),
      );

      const result = await service.setPinnedSpaces(userId, tenantId, spaceIds);

      expect(mockPrismaService.userPinnedSpace.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.userPinnedSpace.createMany).toHaveBeenCalledWith({
        data: [
          { userId, spaceId: 'space-1' },
          { userId, spaceId: 'space-2' },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('should handle empty spaceIds array', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds: string[] = [];

      // Reset mocks specifically for this test
      mockPrismaService.space.findMany.mockReset();
      mockPrismaService.userPinnedSpace.createMany.mockReset();
      mockPrismaService.userPinnedSpace.deleteMany.mockReset();
      mockPrismaService.userPinnedSpace.findMany.mockReset();

      mockPrismaService.space.findMany.mockResolvedValue([]);
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue([]);

      const result = await service.setPinnedSpaces(userId, tenantId, spaceIds);

      expect(mockPrismaService.userPinnedSpace.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.userPinnedSpace.createMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should only pin valid spaces from the tenant', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const spaceIds = ['space-1', 'space-invalid', 'space-2'];

      // Only space-1 and space-2 are valid
      const validSpaces = [
        { id: 'space-1' },
        { id: 'space-2' },
      ];

      mockPrismaService.space.findMany.mockResolvedValueOnce(validSpaces);
      mockPrismaService.userPinnedSpace.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userPinnedSpace.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.userPinnedSpace.findMany.mockResolvedValue([
        { space: { id: 'space-1', name: 'Space 1' } },
        { space: { id: 'space-2', name: 'Space 2' } },
      ]);

      await service.setPinnedSpaces(userId, tenantId, spaceIds);

      expect(mockPrismaService.userPinnedSpace.createMany).toHaveBeenCalledWith({
        data: [
          { userId, spaceId: 'space-1' },
          { userId, spaceId: 'space-2' },
        ],
      });
    });
  });

  describe('create with all fields', () => {
    it('should create a space with all optional fields', async () => {
      const tenantId = 'tenant-123';
      const dto = {
        name: 'Emirates Stadium',
        image: 'https://example.com/stadium.jpg',
        spaceType: 'Stadium',
        maxCapacity: 60000,
        department: 75,
        homeTeam: 'Arsenal FC',
        addressLine1: 'Hornsey Road',
        addressLine2: 'Highbury House',
        city: 'London',
        postcode: 'N7 7AJ',
        country: 'United Kingdom',
        tel: '+44 20 7619 5003',
        email: 'info@arsenal.com',
        mainContactPerson: 'John Smith',
        contactEmail: 'john.smith@arsenal.com',
        contactTel: '+44 20 1234 5678',
        instagram: '@arsenal',
        tiktok: '@arsenal',
        facebook: '@arsenal',
        twitter: '@arsenal',
      };

      const mockSpace = {
        id: 'space-abc123',
        ...dto,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenant: {
          id: tenantId,
          name: 'Test Tenant',
          slug: 'test-tenant',
        },
      };

      mockPrismaService.space.create.mockResolvedValue(mockSpace);

      const result = await service.create(tenantId, dto);

      expect(result).toEqual(mockSpace);
      expect(mockPrismaService.space.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name,
          image: dto.image,
          spaceType: dto.spaceType,
          maxCapacity: dto.maxCapacity,
          department: dto.department,
          homeTeam: dto.homeTeam,
          addressLine1: dto.addressLine1,
          city: dto.city,
          country: dto.country,
          tel: dto.tel,
          email: dto.email,
          instagram: dto.instagram,
          tenantId,
        }),
        include: expect.any(Object),
      });
    });
  });
});
