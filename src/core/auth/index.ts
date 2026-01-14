/**
 * Auth module barrel file
 */

export * from './auth.module';

// Guards
export * from './guards/jwt.guard';
export * from './guards/jwt-db.guard';
export * from './guards/jwt-onboarding.guard';
export * from './guards/roles.guard';

// Decorators
export * from './decorators/current-user.decorator';
export * from './decorators/current-tenant.decorator';
export * from './decorators/roles.decorator';

// Strategies - export only the classes, not conflicting interfaces
export { JwtStrategy } from './strategies/jwt.strategy';
export { JwtOnboardingStrategy } from './strategies/jwt-onboarding.strategy';
export { JwtDatabaseStrategy } from './strategies/jwt-db-lookup.strategy';

// Export JwtPayload from one source only
export type { JwtPayload } from './strategies/jwt.strategy';
