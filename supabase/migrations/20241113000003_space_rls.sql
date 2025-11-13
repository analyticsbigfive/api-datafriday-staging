-- Migration: Enable RLS for Space table
-- Description: Spaces are tenant-scoped

-- Enable RLS
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "space_select_policy" 
  ON "Space"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- INSERT policy
CREATE POLICY "space_insert_policy" 
  ON "Space"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- UPDATE policy
CREATE POLICY "space_update_policy" 
  ON "Space"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- DELETE policy
CREATE POLICY "space_delete_policy" 
  ON "Space"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
