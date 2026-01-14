import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: OrganizationsService;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    domain: 'test.datafriday.io',
    logo: 'https://example.com/logo.png',
    plan: 'PRO',
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockOrganizationsService = {
    getOrganization: jest.fn(),
    updateOrganization: jest.fn(),
    deleteOrganization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
    service = module.get<OrganizationsService>(OrganizationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOrganization', () => {
    it('should return an organization', async () => {
      mockOrganizationsService.getOrganization.mockResolvedValue(mockOrganization);

      const result = await controller.getOrganization('org-123');

      expect(result).toEqual(mockOrganization);
      expect(mockOrganizationsService.getOrganization).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateOrganization', () => {
    it('should update an organization', async () => {
      const updateDto: UpdateOrganizationDto = {
        name: 'Updated Organization',
        logo: 'https://example.com/new-logo.png',
      };
      const updatedOrg = { ...mockOrganization, ...updateDto };
      mockOrganizationsService.updateOrganization.mockResolvedValue(updatedOrg);

      const result = await controller.updateOrganization('org-123', updateDto);

      expect(result).toEqual(updatedOrg);
      expect(mockOrganizationsService.updateOrganization).toHaveBeenCalledWith(
        'org-123',
        updateDto,
      );
    });
  });

  describe('deleteOrganization', () => {
    it('should delete an organization', async () => {
      const deletedOrg = {
        id: 'org-123',
        name: 'Test Organization',
        status: 'SUSPENDED',
      };
      mockOrganizationsService.deleteOrganization.mockResolvedValue(deletedOrg);

      const result = await controller.deleteOrganization('org-123');

      expect(result).toEqual(deletedOrg);
      expect(mockOrganizationsService.deleteOrganization).toHaveBeenCalledWith('org-123');
    });
  });
});
