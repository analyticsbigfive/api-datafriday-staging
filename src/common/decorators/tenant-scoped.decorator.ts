import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator pour extraire le tenantId de la requête
 * Usage: method(@TenantId() tenantId: string)
 */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);

/**
 * Decorator pour extraire tout l'objet tenant
 * Usage: method(@CurrentTenant() tenant: { id: string, name: string, ... })
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant; // Peut être enrichi par un interceptor
  },
);
