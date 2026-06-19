import { SetMetadata } from '@nestjs/common';

export const ALLOW_NO_TENANT_KEY = 'allowNoTenant';

/**
 * Mark an authenticated route as accessible without a resolved tenant.
 *
 * The route still requires a valid JWT (auth runs), but TenantGuard will NOT
 * reject it when the user has no organization yet. Used for the post-login /
 * pre-onboarding surface (e.g. GET /me, which returns a "needs onboarding"
 * response of its own).
 *
 * Usage: @AllowNoTenant()
 */
export const AllowNoTenant = () => SetMetadata(ALLOW_NO_TENANT_KEY, true);
