-- Migration: Enable RLS for Config table
-- Description: Configs are scoped by Space (which is tenant-scoped)

-- Enable RLS
ALTER TABLE "Config" ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Access via Space tenant
CREATE POLICY "config_select_policy" 
  ON "Config"
  FOR SELECT
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- INSERT policy
CREATE POLICY "config_insert_policy" 
  ON "Config"
  FOR INSERT
  WITH CHECK (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- UPDATE policy
CREATE POLICY "config_update_policy" 
  ON "Config"
  FOR UPDATE
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- DELETE policy
CREATE POLICY "config_delete_policy" 
  ON "Config"
  FOR DELETE
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
