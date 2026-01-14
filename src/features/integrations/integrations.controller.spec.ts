import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsController } from './integrations.controller';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';

describe('IntegrationsController', () => {
  let controller: IntegrationsController;
  let weezeventService: WeezeventIntegrationService;
  let webhookService: WebhookIntegrationService;

  const mockWeezeventConfig = {
    clientId: 'client-123',
    organizationId: 'weez-org-456',
    enabled: true,
    configured: true,
  };

  const mockWebhookConfig = {
    enabled: true,
    configured: true,
  };

  const mockWeezeventIntegrationService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
  };

  const mockWebhookIntegrationService = {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        {
          provide: WeezeventIntegrationService,
          useValue: mockWeezeventIntegrationService,
        },
        {
          provide: WebhookIntegrationService,
          useValue: mockWebhookIntegrationService,
        },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
    weezeventService = module.get<WeezeventIntegrationService>(WeezeventIntegrationService);
    webhookService = module.get<WebhookIntegrationService>(WebhookIntegrationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listIntegrations', () => {
    it('should return all integrations', async () => {
      mockWeezeventIntegrationService.getConfig.mockResolvedValue(mockWeezeventConfig);
      mockWebhookIntegrationService.getConfig.mockResolvedValue(mockWebhookConfig);

      const result = await controller.listIntegrations('org-123');

      expect(result).toEqual({
        weezevent: mockWeezeventConfig,
        webhooks: mockWebhookConfig,
      });
      expect(mockWeezeventIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
      expect(mockWebhookIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateWeezeventConfig', () => {
    it('should update Weezevent configuration', async () => {
      const dto: WeezeventConfigDto = {
        weezeventClientId: 'new-client-id',
        weezeventEnabled: true,
      };
      const updatedConfig = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        weezeventClientId: 'new-client-id',
        weezeventEnabled: true,
      };
      mockWeezeventIntegrationService.updateConfig.mockResolvedValue(updatedConfig);

      const result = await controller.updateWeezeventConfig('org-123', dto);

      expect(result).toEqual(updatedConfig);
      expect(mockWeezeventIntegrationService.updateConfig).toHaveBeenCalledWith(
        'org-123',
        dto,
      );
    });
  });

  describe('getWeezeventConfig', () => {
    it('should return Weezevent configuration', async () => {
      mockWeezeventIntegrationService.getConfig.mockResolvedValue(mockWeezeventConfig);

      const result = await controller.getWeezeventConfig('org-123');

      expect(result).toEqual(mockWeezeventConfig);
      expect(mockWeezeventIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateWebhookConfig', () => {
    it('should update webhook configuration', async () => {
      const dto: WebhookConfigDto = {
        weezeventWebhookEnabled: true,
        weezeventWebhookSecret: 'new-secret',
      };
      const updatedConfig = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        weezeventWebhookEnabled: true,
      };
      mockWebhookIntegrationService.updateConfig.mockResolvedValue(updatedConfig);

      const result = await controller.updateWebhookConfig('org-123', dto);

      expect(result).toEqual(updatedConfig);
      expect(mockWebhookIntegrationService.updateConfig).toHaveBeenCalledWith(
        'org-123',
        dto,
      );
    });
  });

  describe('getWebhookConfig', () => {
    it('should return webhook configuration', async () => {
      mockWebhookIntegrationService.getConfig.mockResolvedValue(mockWebhookConfig);

      const result = await controller.getWebhookConfig('org-123');

      expect(result).toEqual(mockWebhookConfig);
      expect(mockWebhookIntegrationService.getConfig).toHaveBeenCalledWith('org-123');
    });
  });
});
