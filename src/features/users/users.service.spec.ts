import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    userTenant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    userSpaceAccess: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    space: {
      findFirst: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
  };

  const mockJwtDatabaseStrategy = {
    invalidateUserCache: jest.fn(),
  };

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    role: UserRole.VIEWER,
    tenantId: mockTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtDatabaseStrategy,
          useValue: mockJwtDatabaseStrategy,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.create.mockResolvedValue({});

      const dto = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await service.create(mockTenantId, dto);

      expect(result).toBeDefined();
      expect(result.email).toBe(dto.email);
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(mockPrismaService.userTenant.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if user exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const dto = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(service.create(mockTenantId, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll(mockTenantId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by search term', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAll(mockTenantId, { search: 'john', page: 1, limit: 20 });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('should filter by role', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAll(mockTenantId, { role: UserRole.ADMIN, page: 1, limit: 20 });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: UserRole.ADMIN,
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findOne(mockUserId, mockTenantId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUserId);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockTenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
      });

      const result = await service.update(mockUserId, mockTenantId, { firstName: 'Jane' });

      expect(result.firstName).toBe('Jane');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.userTenant.deleteMany.mockResolvedValue({});
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove(mockUserId, mockTenantId, 'other-user');

      expect(result.success).toBe(true);
      expect(mockPrismaService.user.delete).toHaveBeenCalled();
    });

    it('should not allow deleting yourself', async () => {
      await expect(service.remove(mockUserId, mockTenantId, mockUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not allow deleting organization owner', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: true });

      await expect(service.remove(mockUserId, mockTenantId, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('changeRole', () => {
    it('should change user role (legacy `role` enum)', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: UserRole.MANAGER });
      mockPrismaService.userTenant.updateMany.mockResolvedValue({});

      const result = await service.changeRole(
        mockUserId,
        mockTenantId,
        { role: UserRole.MANAGER },
        'other-user',
        UserRole.ADMIN,
      );

      expect(result.role).toBe(UserRole.MANAGER);
      expect(mockJwtDatabaseStrategy.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
    });

    it('should change user role via roleId (dynamic RBAC role)', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue({
        id: 'role-manager',
        name: 'MANAGER',
        systemKey: UserRole.MANAGER,
      });
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.userTenant.findFirst.mockResolvedValue({ isOwner: false });
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: UserRole.MANAGER });
      mockPrismaService.userTenant.updateMany.mockResolvedValue({});

      const result = await service.changeRole(
        mockUserId,
        mockTenantId,
        { roleId: 'role-manager' },
        'other-user',
        UserRole.ADMIN,
      );

      expect(result.role).toBe(UserRole.MANAGER);
      expect(result.roleId).toBe('role-manager');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { role: UserRole.MANAGER, roleId: 'role-manager' },
      });
    });

    it('should throw NotFoundException when roleId does not belong to the tenant', async () => {
      mockPrismaService.role.findFirst.mockResolvedValue(null);

      await expect(
        service.changeRole(mockUserId, mockTenantId, { roleId: 'unknown-role' }, 'other-user', UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not allow changing own role', async () => {
      await expect(
        service.changeRole(mockUserId, mockTenantId, { role: UserRole.ADMIN }, mockUserId, UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should require either roleId or role', async () => {
      await expect(
        service.changeRole(mockUserId, mockTenantId, {}, 'other-user', UserRole.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatistics', () => {
    it('should return user statistics', async () => {
      mockPrismaService.user.count.mockResolvedValue(10);
      mockPrismaService.user.groupBy.mockResolvedValue([
        { role: UserRole.ADMIN, _count: 2 },
        { role: UserRole.VIEWER, _count: 8 },
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getStatistics(mockTenantId);

      expect(result.total).toBe(10);
      expect(result.byRole.ADMIN).toBe(2);
      expect(result.byRole.VIEWER).toBe(8);
      expect(result.recentUsers).toHaveLength(1);
    });
  });
});
