import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeController } from './me.controller';
import { PrismaService } from '../../core/database/prisma.service';

describe('MeController', () => {
  let controller: MeController;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'ADMIN',
    tenantId: 'tenant-123',
    tenant: {
      id: 'tenant-123',
      name: 'Test Organization',
      slug: 'test-org',
      plan: 'PRO',
      status: 'ACTIVE',
    },
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await controller.getCurrentUser({ id: 'user-123' });

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: expect.objectContaining({
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          tenantId: true,
          tenant: expect.any(Object),
        }),
      });
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await controller.getCurrentUser({ id: 'non-existent' });

      expect(result).toBeNull();
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
});
