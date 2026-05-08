import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route or controller as publicly accessible.
 * The global JwtDatabaseGuard will skip authentication for routes with this decorator.
 * Note: route-level guards (e.g. JwtOnboardingGuard) still run when explicitly declared.
 *
 * Usage: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
