/**
 * Interface for entities that belong to a tenant
 */
export interface TenantAware {
  tenantId: string;
}

/**
 * Interface for requests with tenant context
 */
export interface RequestWithTenant extends Request {
  tenantId?: string;
  user?: {
    id: string;
    email: string;
    tenantId: string;
    role: string;
  };
}
