-- Migration: Enable RLS for Station table
-- Description: Stations are scoped by Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "Station" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "station_all_policy" 
  ON "Station"
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
