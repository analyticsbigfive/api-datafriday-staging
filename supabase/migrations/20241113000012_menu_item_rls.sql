-- Migration: Enable RLS for MenuItem table
-- Description: Menu items are scoped by Menu → Space (tenant-scoped)

-- Enable RLS
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "menu_item_all_policy" 
  ON "MenuItem"
  FOR ALL
  USING (
    "menuId" IN (
      SELECT m.id FROM "Menu" m
      JOIN "Space" s ON m."spaceId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
