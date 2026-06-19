/**
 * Auth module barrel file
 */

export * from './auth.module';

// Guards
export * from './guards/jwt-db.guard';
export * from './guards/jwt-onboarding.guard';
export * from './guards/roles.guard';
export * from './guards/permissions.guard';
export * from './guards/tenant.guard';

// Decorators
export * from './decorators/current-user.decorator';
export * from './decorators/current-tenant.decorator';
export * from './decorators/roles.decorator';
export * from './decorators/permissions.decorator';
export * from './decorators/public.decorator';

// Strategies
export { JwtOnboardingStrategy } from './strategies/jwt-onboarding.strategy';
export { JwtDatabaseStrategy } from './strategies/jwt-db-lookup.strategy';

// Export JwtPayload from one source only
export type { JwtPayload } from './strategies/jwt-db-lookup.strategy';
