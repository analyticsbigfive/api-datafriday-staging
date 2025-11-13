-- Migration: Enable RLS for Menu table
-- Description: Menus are scoped by Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "Menu" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "menu_all_policy" 
  ON "Menu"
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
