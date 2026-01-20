import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

describe('OrchestratorController', () => {
  let controller: OrchestratorController;
  let service: jest.Mocked<OrchestratorService>;

  beforeEach(async () => {
    const mockService = {
      healthCheck: jest.fn().mockResolvedValue({
        redis: true,
        queues: {
          'data-sync': { waiting: 0, active: 0, completed: 10, failed: 0 },
        },
        edgeFunction: true,
      }),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
      decideStrategy: jest.fn().mockReturnValue({
        strategy: 'sync',
        reason: 'Small dataset',
        estimatedDuration: 500,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestratorController],
      providers: [
        { provide: OrchestratorService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<OrchestratorController>(OrchestratorController);
    service = module.get(OrchestratorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toEqual({
        redis: true,
        queues: expect.any(Object),
        edgeFunction: true,
      });
      expect(service.healthCheck).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache for tenant', async () => {
      const result = await controller.invalidateCache({
        tenantId: 'tenant-123',
      });

      expect(result).toEqual({
        success: true,
        message: 'Cache invalidated',
      });
      expect(service.invalidateCache).toHaveBeenCalledWith('tenant-123', undefined);
    });

    it('should invalidate cache for specific space', async () => {
      const result = await controller.invalidateCache({
        tenantId: 'tenant-123',
        spaceId: 'space-456',
      });

      expect(service.invalidateCache).toHaveBeenCalledWith('tenant-123', 'space-456');
    });
  });

  describe('getStrategy', () => {
    it('should return processing strategy', () => {
      const result = controller.getStrategy(
        'tenant-123',
        'sync',
        '500',
        'normal',
      );

      expect(result).toEqual({
        strategy: 'sync',
        reason: 'Small dataset',
        estimatedDuration: 500,
      });
      expect(service.decideStrategy).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        operation: 'sync',
        estimatedItems: 500,
        priority: 'normal',
      });
    });

    it('should handle missing optional params', () => {
      controller.getStrategy('tenant-123', 'analytics');

      expect(service.decideStrategy).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        operation: 'analytics',
        estimatedItems: undefined,
        priority: undefined,
      });
    });
  });
});
