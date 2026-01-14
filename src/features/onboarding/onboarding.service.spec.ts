import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../core/database/prisma.service';
import { EncryptionService } from '../../core/encryption/encryption.service';

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
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue('encrypted-data'),
    decrypt: jest.fn().mockReturnValue('decrypted-data'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
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

    it('should handle existing user by updating tenant relation', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      mockPrismaService.tenant.findFirst.mockResolvedValue(null);

      const existingUser = {
        id: supabaseUserId,
        email: email,
        firstName: 'John',
        lastName: 'Doe',
        tenantId: 'existing-tenant',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          tenant: {
            create: jest.fn().mockResolvedValue({
              id: 'tenant-1',
              name: 'My Company',
              slug: 'my-company',
              plan: 'FREE',
              status: 'TRIAL',
            }),
          },
          user: { 
            findUnique: jest.fn().mockResolvedValue(existingUser),
            create: jest.fn().mockResolvedValue({}) 
          },
          userTenant: { create: jest.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      // Should not throw - it handles existing user by using it
      const result = await service.createOrganization(supabaseUserId, email, dto);
      expect(result.tenant.id).toBe('tenant-1');
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
