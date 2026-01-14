import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

/**
 * PrismaService Integration Tests
 * These tests require a real database connection and should be run separately
 * Skip these tests if DATABASE_URL is not set
 */
const hasDatabase = !!process.env.DATABASE_URL;

(hasDatabase ? describe : describe.skip)('PrismaService (Integration)', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    await service.$disconnect();
  });

  describe('Connection', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should connect to database', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('Transaction', () => {
    it('should execute transaction successfully', async () => {
      const result = await service.executeTransaction(async (prisma) => {
        return { success: true };
      });

      expect(result).toEqual({ success: true });
    });

    it('should retry failed transactions', async () => {
      let attempts = 0;

      await expect(
        service.executeTransaction(async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        }),
      ).resolves.toEqual({ success: true });

      expect(attempts).toBe(2);
    });

    it('should fail after max retries', async () => {
      await expect(
        service.executeTransaction(
          async () => {
            throw new Error('Persistent failure');
          },
          2, // maxRetries
        ),
      ).rejects.toThrow('Persistent failure');
    });
  });

  describe('Clean Database', () => {
    it.skip('should clean database in test environment', async () => {
      // Skip: nécessite une DB test dédiée
      // À tester dans les tests E2E
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await expect(service.cleanDatabase()).resolves.not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw error in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(service.cleanDatabase()).rejects.toThrow(
        'Cannot clean database in production!',
      );

      process.env.NODE_ENV = originalEnv;
    });
  });
});
