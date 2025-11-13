-- Migration: Enable RLS for User table
-- Description: Users can only access users from their own tenant

-- Enable RLS
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can see other users in same tenant
CREATE POLICY "user_select_policy" 
  ON "User"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- INSERT policy: Users can create new users in their tenant
CREATE POLICY "user_insert_policy" 
  ON "User"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- UPDATE policy: Users can update users in their tenant
CREATE POLICY "user_update_policy" 
  ON "User"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- DELETE policy: Users can delete users in their tenant
CREATE POLICY "user_delete_policy" 
  ON "User"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
