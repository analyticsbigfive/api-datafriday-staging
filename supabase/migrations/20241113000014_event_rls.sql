-- Migration: Enable RLS for Event table
-- Description: Events are scoped by Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "event_all_policy" 
  ON "Event"
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
