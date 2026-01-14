/**
 * Shared decorators barrel file
 * Re-exports decorators from core/auth for convenience
 */

export { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
export { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
export { Roles } from '../../core/auth/decorators/roles.decorator';
