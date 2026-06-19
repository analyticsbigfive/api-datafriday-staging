import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  const ctxWith = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any);

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  it('allows @Public() routes regardless of tenant', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true); // IS_PUBLIC
    expect(guard.canActivate(ctxWith(undefined))).toBe(true);
  });

  it('allows @AllowNoTenant() routes without a tenant', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // IS_PUBLIC
      .mockReturnValueOnce(true); // ALLOW_NO_TENANT
    expect(guard.canActivate(ctxWith({ id: 'u1', tenantId: null }))).toBe(true);
  });

  it('rejects a protected route when no tenant is resolved', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);
    expect(() => guard.canActivate(ctxWith({ id: 'u1', tenantId: null }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a protected route when a tenant is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);
    expect(guard.canActivate(ctxWith({ id: 'u1', tenantId: 'tenant-1' }))).toBe(true);
  });
});
