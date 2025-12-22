import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganization', () => {
    const supabaseUserId = 'auth0|123';
    const email = 'user@example.com';
    const dto = {
      firstName: 'John',
      lastName: 'Doe',
      organizationName: 'My Company',
      organizationType: 'Restaurant',
      organizationEmail: 'contact@mycompany.com',
      organizationPhone: '+33123456789',
    };

    it('should create tenant and user successfully', async () => {
      // Mock: user doesn't exist
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      // Mock: slug is unique
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      // Mock: transaction success
      const mockTenant = {
        id: 'tenant-1',
        name: 'My Company',
        slug: 'my-company',
        plan: 'FREE',
        status: 'TRIAL',
      };
      const mockUser = {
        id: supabaseUserId,
        email,
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        tenantId: 'tenant-1',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          tenant: { create: jest.fn().mockResolvedValue(mockTenant) },
          user: { 
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockUser) 
          },
          userTenant: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.createOrganization(
        supabaseUserId,
        email,
        dto,
      );

      expect(result.tenant).toEqual({
        id: mockTenant.id,
        name: mockTenant.name,
        slug: mockTenant.slug,
        plan: mockTenant.plan,
        status: mockTenant.status,
      });
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
      });
    });

    it('should throw ConflictException if user already has organization', async () => {
      // Mock: user exists
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: supabaseUserId,
        tenantId: 'existing-tenant',
      });

      await expect(
        service.createOrganization(supabaseUserId, email, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('should generate unique slug if conflict exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      // Mock: first slug exists, second is unique
      mockPrismaService.tenant.findUnique
        .mockResolvedValueOnce({ slug: 'my-company' })
        .mockResolvedValueOnce(null);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          tenant: {
            create: jest.fn().mockResolvedValue({
              id: 'tenant-1',
              slug: 'my-company-1',
            }),
          },
          user: { 
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}) 
          },
          userTenant: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const result = await service.createOrganization(
        supabaseUserId,
        email,
        dto,
      );

      expect(result.tenant.slug).toBe('my-company-1');
    });
  });
});
