import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status', () => {
      const result = controller.check();

      expect(result).toEqual({
        status: 'ok',
        message: 'API is running',
        timestamp: expect.any(String),
        version: '1.0.0',
        phase: 'HEOS Architecture - Redis + BullMQ',
      });
    });

    it('should return valid ISO timestamp', () => {
      const result = controller.check();

      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe('protectedRoute', () => {
    it('should return user info', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN',
      };
      const tenantId = 'tenant-123';

      const result = controller.protectedRoute(mockUser, tenantId);

      expect(result).toEqual({
        message: 'Authentication successful!',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'ADMIN',
        },
        tenantId: 'tenant-123',
        timestamp: expect.any(String),
      });
    });
  });

  describe('adminRoute', () => {
    it('should return admin info', () => {
      const mockUser = {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'ADMIN',
      };

      const result = controller.adminRoute(mockUser);

      expect(result).toEqual({
        message: 'Admin access granted!',
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
        timestamp: expect.any(String),
      });
    });
  });
});
