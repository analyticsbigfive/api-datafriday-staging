import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { UserRole } from '@prisma/client';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        user: {
          id: 'user-123',
          tenantId: 'tenant-456',
          role: {
            systemKey: UserRole.STAFF,
            permissions: ['org.users.view'],
          },
        },
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as any;
    });

    it('should allow access when no permissions are required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should allow access when user has one of the required permissions', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['org.users.manage', 'org.users.view']);

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should deny access when user lacks the required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.users.manage']);

      expect(guard.canActivate(mockContext)).toBe(false);
    });

    it('should deny access when user is not authenticated', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.users.manage']);
      mockRequest.user = undefined;

      expect(guard.canActivate(mockContext)).toBe(false);
    });

    it('should always allow access when user.role.systemKey is ADMIN', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['org.permissions.manage']);
      mockRequest.user.role = { systemKey: UserRole.ADMIN, permissions: [] };

      expect(guard.canActivate(mockContext)).toBe(true);
    });
  });
});
