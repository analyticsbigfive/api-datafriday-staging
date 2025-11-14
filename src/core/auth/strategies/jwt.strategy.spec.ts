import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe.skip('JwtStrategy', () => {
  // Skip: Requires container rebuild with updated packages
  // TODO: Re-enable after container rebuild
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user object when payload is valid', async () => {
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        org_id: 'tenant-456',
        role: 'ADMIN',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-456',
        role: 'ADMIN',
      });
    });

    it('should throw UnauthorizedException when sub is missing', async () => {
      const payload: Partial<JwtPayload> = {
        email: 'test@example.com',
        org_id: 'tenant-456',
        role: 'ADMIN',
      };

      await expect(strategy.validate(payload as JwtPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when org_id is missing', async () => {
      const payload: Partial<JwtPayload> = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN',
      };

      await expect(strategy.validate(payload as JwtPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
