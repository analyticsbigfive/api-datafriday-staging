/**
 * CLS (AsyncLocalStorage) keys carrying the per-request tenant context.
 * Shared by PrismaService (auto-scoping) and TenantContextService (app code).
 */
export const TENANT_ID_KEY = 'tenantId';
export const BYPASS_TENANT_KEY = 'bypassTenant';
