import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom throttler guard that tracks rate limits per tenant
 * instead of per IP address. This ensures fair usage across
 * multi-tenant SaaS environments.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use tenantId from authenticated user for rate limiting
    // Falls back to IP address for unauthenticated requests
    const user = req.user;
    if (user?.tenantId) {
      return `tenant:${user.tenantId}`;
    }
    return req.ip || req.ips?.[0] || 'unknown';
  }
}
