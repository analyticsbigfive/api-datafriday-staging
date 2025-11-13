-- Migration: Enable RLS for Floor table
-- Description: Floors are scoped by Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "Floor" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "floor_all_policy" 
  ON "Floor"
  FOR ALL
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  )
  WITH CHECK (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
