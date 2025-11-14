import { Test, TestingModule } from '@nestjs/testing';
import { TenantInterceptor } from './tenant.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestWithTenant } from '../../shared/interfaces/tenant-aware.interface';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantInterceptor],
    }).compile();

    interceptor = module.get<TenantInterceptor>(TenantInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should extract tenantId from user JWT', (done) => {
    const mockRequest: Partial<RequestWithTenant> = {
      method: 'GET',
      url: '/api/v1/spaces',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-456',
        role: 'ADMIN',
      },
    };

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockRequest.tenantId).toBe('tenant-456');
        done();
      },
    });
  });

  it('should handle missing user context gracefully', (done) => {
    const mockRequest: Partial<RequestWithTenant> = {
      method: 'GET',
      url: '/api/v1/public',
      user: undefined,
    };

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockRequest.tenantId).toBeUndefined();
        done();
      },
    });
  });
});
