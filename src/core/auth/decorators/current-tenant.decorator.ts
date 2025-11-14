import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract current tenantId from request
 * Usage: @CurrentTenant() tenantId: string
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId || request.tenantId;
  },
);
