-- Migration: RLS complet pour toutes les tables restantes
-- Date: 2024-11-13

-- ==================== MenuComponent ====================
ALTER TABLE "MenuComponent" ENABLE ROW LEVEL SECURITY;

-- MenuComponent n'a pas de tenantId direct, donc accessible par tous (public data)
CREATE POLICY "menucomponent_select_policy"
  ON "MenuComponent"
  FOR SELECT
  USING (true);

CREATE POLICY "menucomponent_insert_policy"
  ON "MenuComponent"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menucomponent_update_policy"
  ON "MenuComponent"
  FOR UPDATE
  USING (true);

CREATE POLICY "menucomponent_delete_policy"
  ON "MenuComponent"
  FOR DELETE
  USING (true);

-- ==================== ComponentIngredient ====================
ALTER TABLE "ComponentIngredient" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "componentingredient_select_policy"
  ON "ComponentIngredient"
  FOR SELECT
  USING (true);

CREATE POLICY "componentingredient_insert_policy"
  ON "ComponentIngredient"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "componentingredient_update_policy"
  ON "ComponentIngredient"
  FOR UPDATE
  USING (true);

CREATE POLICY "componentingredient_delete_policy"
  ON "ComponentIngredient"
  FOR DELETE
  USING (true);

-- ==================== ComponentComponent ====================
ALTER TABLE "ComponentComponent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "componentcomponent_select_policy"
  ON "ComponentComponent"
  FOR SELECT
  USING (true);

CREATE POLICY "componentcomponent_insert_policy"
  ON "ComponentComponent"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "componentcomponent_update_policy"
  ON "ComponentComponent"
  FOR UPDATE
  USING (true);

CREATE POLICY "componentcomponent_delete_policy"
  ON "ComponentComponent"
  FOR DELETE
  USING (true);

-- ==================== Packaging ====================
ALTER TABLE "Packaging" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packaging_select_policy"
  ON "Packaging"
  FOR SELECT
  USING (true);

CREATE POLICY "packaging_insert_policy"
  ON "Packaging"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "packaging_update_policy"
  ON "Packaging"
  FOR UPDATE
  USING (true);

CREATE POLICY "packaging_delete_policy"
  ON "Packaging"
  FOR DELETE
  USING (true);

-- ==================== MenuItemComponent ====================
ALTER TABLE "MenuItemComponent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menuitemcomponent_select_policy"
  ON "MenuItemComponent"
  FOR SELECT
  USING (true);

CREATE POLICY "menuitemcomponent_insert_policy"
  ON "MenuItemComponent"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menuitemcomponent_update_policy"
  ON "MenuItemComponent"
  FOR UPDATE
  USING (true);

CREATE POLICY "menuitemcomponent_delete_policy"
  ON "MenuItemComponent"
  FOR DELETE
  USING (true);

-- ==================== MenuItemIngredient ====================
ALTER TABLE "MenuItemIngredient" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menuitemingredient_select_policy"
  ON "MenuItemIngredient"
  FOR SELECT
  USING (true);

CREATE POLICY "menuitemingredient_insert_policy"
  ON "MenuItemIngredient"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menuitemingredient_update_policy"
  ON "MenuItemIngredient"
  FOR UPDATE
  USING (true);

CREATE POLICY "menuitemingredient_delete_policy"
  ON "MenuItemIngredient"
  FOR DELETE
  USING (true);

-- ==================== MenuItemPackaging ====================
ALTER TABLE "MenuItemPackaging" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menuitempackaging_select_policy"
  ON "MenuItemPackaging"
  FOR SELECT
  USING (true);

CREATE POLICY "menuitempackaging_insert_policy"
  ON "MenuItemPackaging"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menuitempackaging_update_policy"
  ON "MenuItemPackaging"
  FOR UPDATE
  USING (true);

CREATE POLICY "menuitempackaging_delete_policy"
  ON "MenuItemPackaging"
  FOR DELETE
  USING (true);

-- ==================== MenuAssignment ====================
ALTER TABLE "MenuAssignment" ENABLE ROW LEVEL SECURITY;

-- MenuAssignment lié à Station → Config → Space → Tenant
CREATE POLICY "menuassignment_select_policy"
  ON "MenuAssignment"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Station" s
      INNER JOIN "Config" c ON s."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE s.id = "MenuAssignment"."stationId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "menuassignment_insert_policy"
  ON "MenuAssignment"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Station" s
      INNER JOIN "Config" c ON s."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE s.id = "MenuAssignment"."stationId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "menuassignment_update_policy"
  ON "MenuAssignment"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Station" s
      INNER JOIN "Config" c ON s."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE s.id = "MenuAssignment"."stationId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "menuassignment_delete_policy"
  ON "MenuAssignment"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Station" s
      INNER JOIN "Config" c ON s."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE s.id = "MenuAssignment"."stationId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== CsvMapping ====================
ALTER TABLE "CsvMapping" ENABLE ROW LEVEL SECURITY;

-- CsvMapping est global (pas de tenant), accessible par tous
CREATE POLICY "csvmapping_select_policy"
  ON "CsvMapping"
  FOR SELECT
  USING (true);

CREATE POLICY "csvmapping_insert_policy"
  ON "CsvMapping"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "csvmapping_update_policy"
  ON "CsvMapping"
  FOR UPDATE
  USING (true);

CREATE POLICY "csvmapping_delete_policy"
  ON "CsvMapping"
  FOR DELETE
  USING (true);

-- ==================== UserPinnedSpace ====================
ALTER TABLE "UserPinnedSpace" ENABLE ROW LEVEL SECURITY;

-- User peut voir/gérer ses propres espaces épinglés
CREATE POLICY "userpinnedspace_select_policy"
  ON "UserPinnedSpace"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserPinnedSpace"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userpinnedspace_insert_policy"
  ON "UserPinnedSpace"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserPinnedSpace"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userpinnedspace_update_policy"
  ON "UserPinnedSpace"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserPinnedSpace"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userpinnedspace_delete_policy"
  ON "UserPinnedSpace"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserPinnedSpace"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== UserSpaceAccess ====================
ALTER TABLE "UserSpaceAccess" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "userspaceaccess_select_policy"
  ON "UserSpaceAccess"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserSpaceAccess"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userspaceaccess_insert_policy"
  ON "UserSpaceAccess"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserSpaceAccess"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userspaceaccess_update_policy"
  ON "UserSpaceAccess"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserSpaceAccess"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "userspaceaccess_delete_policy"
  ON "UserSpaceAccess"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "UserSpaceAccess"."userId"
        AND u."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== FloorElement ====================
ALTER TABLE "FloorElement" ENABLE ROW LEVEL SECURITY;

-- FloorElement lié à Floor → Config → Space → Tenant
CREATE POLICY "floorelement_select_policy"
  ON "FloorElement"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Floor" f
      INNER JOIN "Config" c ON f."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE f.id = "FloorElement"."floorId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floorelement_insert_policy"
  ON "FloorElement"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Floor" f
      INNER JOIN "Config" c ON f."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE f.id = "FloorElement"."floorId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floorelement_update_policy"
  ON "FloorElement"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Floor" f
      INNER JOIN "Config" c ON f."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE f.id = "FloorElement"."floorId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floorelement_delete_policy"
  ON "FloorElement"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Floor" f
      INNER JOIN "Config" c ON f."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE f.id = "FloorElement"."floorId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== Forecourt ====================
ALTER TABLE "Forecourt" ENABLE ROW LEVEL SECURITY;

-- Forecourt lié à Config → Space → Tenant
CREATE POLICY "forecourt_select_policy"
  ON "Forecourt"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Forecourt"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourt_insert_policy"
  ON "Forecourt"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Forecourt"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourt_update_policy"
  ON "Forecourt"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Forecourt"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourt_delete_policy"
  ON "Forecourt"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Forecourt"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== ForecourtElement ====================
ALTER TABLE "ForecourtElement" ENABLE ROW LEVEL SECURITY;

-- ForecourtElement lié à Forecourt → Config → Space → Tenant
CREATE POLICY "forecourtelement_select_policy"
  ON "ForecourtElement"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Forecourt" fc
      INNER JOIN "Config" c ON fc."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE fc.id = "ForecourtElement"."forecourtId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourtelement_insert_policy"
  ON "ForecourtElement"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Forecourt" fc
      INNER JOIN "Config" c ON fc."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE fc.id = "ForecourtElement"."forecourtId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourtelement_update_policy"
  ON "ForecourtElement"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Forecourt" fc
      INNER JOIN "Config" c ON fc."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE fc.id = "ForecourtElement"."forecourtId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "forecourtelement_delete_policy"
  ON "ForecourtElement"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Forecourt" fc
      INNER JOIN "Config" c ON fc."configId" = c.id
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE fc.id = "ForecourtElement"."forecourtId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
