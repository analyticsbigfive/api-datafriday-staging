import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';

describe('MeController', () => {
  let controller: MeController;
  let prisma: PrismaService;

  const mockUser: CurrentUserData = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    tenantId: 'tenant-123',
    tenant: {
      id: 'tenant-123',
      name: 'Test Organization',
      slug: 'test-org',
      plan: 'PRO',
      status: 'ACTIVE',
    },
    role: {
      id: 'role-123',
      name: 'Admin',
      systemKey: 'ADMIN',
      isSystem: true,
      permissions: [],
    },
    isOwner: true,
    isSuperAdmin: false,
    allSpacesAccess: true,
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtDatabaseStrategy = {
    invalidateUserCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
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

    controller = module.get<MeController>(MeController);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentUser', () => {
    it('should return current user with tenant', async () => {
      const result = await controller.getCurrentUser(mockUser);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user has no tenant (onboarding required)', async () => {
      const userWithoutTenant: CurrentUserData = {
        ...mockUser,
        tenantId: null,
        tenant: null,
      };

      await expect(controller.getCurrentUser(userWithoutTenant)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCurrentUserTenant', () => {
    it('should return current user tenant', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUserTenant({ id: 'user-123' });

      expect(result).toEqual(mockUser.tenant);
    });

    it('should throw NotFoundException when user has no tenant', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: null,
      });

      await expect(
        controller.getCurrentUserTenant({ id: 'user-123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        controller.getCurrentUserTenant({ id: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe (self profile)', () => {
    it('updates own identity fields, recomputes fullName, and invalidates cache', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ firstName: 'John', lastName: 'Doe' });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-123',
        firstName: 'Jane',
        lastName: 'Roe',
        fullName: 'Jane Roe',
      });

      const result = await controller.updateMe(mockUser, { firstName: 'Jane', lastName: 'Roe' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: expect.objectContaining({ firstName: 'Jane', lastName: 'Roe', fullName: 'Jane Roe' }),
        }),
      );
      expect(mockJwtDatabaseStrategy.invalidateUserCache).toHaveBeenCalledWith('user-123');
      expect(result.fullName).toBe('Jane Roe');
    });
  });
});
