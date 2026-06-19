import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_NO_TENANT_KEY } from '../decorators/allow-no-tenant.decorator';

/**
 * Defense-in-depth guard: rejects any authenticated route whose request has no
 * resolved tenant context. Complements the automatic Prisma tenant-scoping —
 * if a handler ever runs without a tenant, we fail closed (403) instead of
 * silently leaking or returning unscoped data.
 *
 * Skipped for:
 *  - @Public() routes (onboarding, health, webhooks)
 *  - @AllowNoTenant() routes (post-login / pre-onboarding surface, e.g. /me)
 *
 * Registered globally AFTER JwtDatabaseGuard so `request.user` is populated.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowNoTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_NO_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowNoTenant) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request?.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(
        'No organization context. Complete onboarding before accessing this resource.',
      );
    }

    return true;
  }
}
