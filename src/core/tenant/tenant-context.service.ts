import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { BYPASS_TENANT_KEY, TENANT_ID_KEY } from './tenant-context.constants';

/**
 * Typed accessor over the request-scoped CLS context for the current tenant.
 *
 * Used by app services that need to read the active tenant or temporarily
 * disable Prisma auto-scoping for legitimate cross-tenant / system operations
 * (onboarding tenant lookup, system-permission seeding, auth user lookup).
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  /** Active tenant id, or undefined when outside an HTTP request (jobs, seeds). */
  getTenantId(): string | undefined {
    if (!this.cls.isActive()) {
      return undefined;
    }
    return this.cls.get<string | undefined>(TENANT_ID_KEY);
  }

  setTenantId(tenantId: string | null | undefined): void {
    if (!this.cls.isActive()) {
      return;
    }
    this.cls.set(TENANT_ID_KEY, tenantId ?? undefined);
  }

  /** True when tenant scoping is disabled (no context, or inside a bypass block). */
  isBypassed(): boolean {
    if (!this.cls.isActive()) {
      return true;
    }
    return this.cls.get<boolean>(BYPASS_TENANT_KEY) === true;
  }

  /**
   * Run `fn` with tenant auto-scoping disabled. Restores the previous flag
   * afterwards. Use sparingly for cross-tenant / system operations.
   */
  async runWithoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cls.isActive()) {
      return fn();
    }
    const previous = this.cls.get<boolean>(BYPASS_TENANT_KEY);
    this.cls.set(BYPASS_TENANT_KEY, true);
    try {
      return await fn();
    } finally {
      this.cls.set(BYPASS_TENANT_KEY, previous);
    }
  }
}
