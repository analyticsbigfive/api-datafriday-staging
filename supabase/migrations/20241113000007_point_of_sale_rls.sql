-- Migration: Enable RLS for PointOfSale table
-- Description: Points of Sale are scoped by Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "PointOfSale" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "pos_all_policy" 
  ON "PointOfSale"
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
