import { Test, TestingModule } from '@nestjs/testing';
import { SpacesService } from './spaces.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

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
      delete: jest.fn(),
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
    },
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
});
