-- Migration: Enable RLS for Tenant table
-- Description: Row-Level Security policies for multi-tenant isolation

-- Enable RLS
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can only see their own tenant
CREATE POLICY "tenant_select_policy" 
  ON "Tenant"
  FOR SELECT
  USING (
    id::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- INSERT policy: Only system can create tenants (no policy = deny all inserts via RLS)
-- Tenants should be created via API with service role

-- UPDATE policy: Users can update their own tenant
CREATE POLICY "tenant_update_policy" 
  ON "Tenant"
  FOR UPDATE
  USING (
    id::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    id::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- DELETE policy: Only system can delete tenants (no policy = deny all deletes)
