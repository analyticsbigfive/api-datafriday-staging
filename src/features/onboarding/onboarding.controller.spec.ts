import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JoinByCodeDto } from './dto/join-by-code.dto';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let service: OnboardingService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Organization',
    slug: 'test-org',
    plan: 'FREE',
    status: 'ACTIVE',
    invitationCode: 'ABC123',
  };

  const mockDbUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'ADMIN',
    tenantId: 'tenant-123',
  };

  const mockOnboardingService = {
    getUserStatus: jest.fn(),
    createOrganization: jest.fn(),
    joinByInvitationCode: jest.fn(),
    joinTenant: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: mockOnboardingService,
        },
      ],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
    service = module.get<OnboardingService>(OnboardingService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserStatus', () => {
    it('should return status for new user', async () => {
      mockOnboardingService.getUserStatus.mockResolvedValue({
        exists: false,
        hasOrganization: false,
        user: null,
        tenant: null,
      });

      const result = await controller.getUserStatus(mockUser);

      expect(result).toEqual({
        exists: false,
        hasOrganization: false,
        user: null,
        tenant: null,
      });
      expect(mockOnboardingService.getUserStatus).toHaveBeenCalledWith(
        'user-123',
        'test@example.com',
      );
    });

    it('should return status for existing user with org', async () => {
      mockOnboardingService.getUserStatus.mockResolvedValue({
        exists: true,
        hasOrganization: true,
        user: mockDbUser,
        tenant: mockTenant,
      });

      const result = await controller.getUserStatus(mockUser);

      expect(result.exists).toBe(true);
      expect(result.hasOrganization).toBe(true);
      expect(result.tenant).toEqual(mockTenant);
    });
  });

  describe('createOrganization', () => {
    it('should create a new organization', async () => {
      const createDto: Partial<CreateOrganizationDto> = {
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'My Organization',
        organizationType: 'Restaurant',
        organizationEmail: 'contact@myorg.com',
        organizationPhone: '+33612345678',
      };
      mockOnboardingService.createOrganization.mockResolvedValue({
        tenant: mockTenant,
        user: mockDbUser,
      });

      const result = await controller.createOrganization(mockUser, createDto as CreateOrganizationDto);

      expect(result.tenant).toEqual(mockTenant);
      expect(result.user).toEqual(mockDbUser);
      expect(mockOnboardingService.createOrganization).toHaveBeenCalledWith(
        'user-123',
        'test@example.com',
        createDto,
      );
    });
  });

  describe('joinByInvitationCode', () => {
    it('should join organization by invitation code', async () => {
      const joinDto: JoinByCodeDto = {
        invitationCode: 'ABC123',
        firstName: 'Jane',
        lastName: 'Doe',
      };
      mockOnboardingService.joinByInvitationCode.mockResolvedValue({
        tenant: mockTenant,
        user: { ...mockDbUser, role: 'STAFF' },
      });

      const result = await controller.joinByInvitationCode(mockUser, joinDto);

      expect(result.tenant).toEqual(mockTenant);
      expect(mockOnboardingService.joinByInvitationCode).toHaveBeenCalledWith(
        'user-123',
        'test@example.com',
        'ABC123',
        'Jane',
        'Doe',
      );
    });
  });
});
