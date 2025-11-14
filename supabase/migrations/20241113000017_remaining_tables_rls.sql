-- Migration: RLS pour les tables restantes (correctes)
-- Date: 2024-11-13

-- ==================== Config ====================
ALTER TABLE "Config" ENABLE ROW LEVEL SECURITY;

-- Config lié à Space → Tenant
CREATE POLICY "config_select_policy"
  ON "Config"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Space" sp
      WHERE sp.id = "Config"."spaceId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_insert_policy"
  ON "Config"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Space" sp
      WHERE sp.id = "Config"."spaceId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_update_policy"
  ON "Config"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Space" sp
      WHERE sp.id = "Config"."spaceId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_delete_policy"
  ON "Config"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Space" sp
      WHERE sp.id = "Config"."spaceId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== Floor ====================
ALTER TABLE "Floor" ENABLE ROW LEVEL SECURITY;

-- Floor lié à Config → Space → Tenant
CREATE POLICY "floor_select_policy"
  ON "Floor"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Floor"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floor_insert_policy"
  ON "Floor"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Floor"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floor_update_policy"
  ON "Floor"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Floor"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "floor_delete_policy"
  ON "Floor"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Floor"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==================== MarketPrice ====================
ALTER TABLE "MarketPrice" ENABLE ROW LEVEL SECURITY;

-- MarketPrice lié à Supplier → Tenant
CREATE POLICY "marketprice_select_policy"
  ON "MarketPrice"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Supplier" s
      WHERE s.id = "MarketPrice"."supplierId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "MarketPrice"."supplierId" IS NULL
  );

CREATE POLICY "marketprice_insert_policy"
  ON "MarketPrice"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Supplier" s
      WHERE s.id = "MarketPrice"."supplierId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "MarketPrice"."supplierId" IS NULL
  );

CREATE POLICY "marketprice_update_policy"
  ON "MarketPrice"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Supplier" s
      WHERE s.id = "MarketPrice"."supplierId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "MarketPrice"."supplierId" IS NULL
  );

CREATE POLICY "marketprice_delete_policy"
  ON "MarketPrice"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Supplier" s
      WHERE s.id = "MarketPrice"."supplierId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "MarketPrice"."supplierId" IS NULL
  );

-- ==================== Ingredient ====================
ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;

-- Ingredient lié à MarketPrice → Supplier → Tenant
CREATE POLICY "ingredient_select_policy"
  ON "Ingredient"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "MarketPrice" mp
      INNER JOIN "Supplier" s ON mp."supplierId" = s.id
      WHERE mp.id = "Ingredient"."marketPriceId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "Ingredient"."marketPriceId" IS NULL
  );

CREATE POLICY "ingredient_insert_policy"
  ON "Ingredient"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "MarketPrice" mp
      INNER JOIN "Supplier" s ON mp."supplierId" = s.id
      WHERE mp.id = "Ingredient"."marketPriceId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "Ingredient"."marketPriceId" IS NULL
  );

CREATE POLICY "ingredient_update_policy"
  ON "Ingredient"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "MarketPrice" mp
      INNER JOIN "Supplier" s ON mp."supplierId" = s.id
      WHERE mp.id = "Ingredient"."marketPriceId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "Ingredient"."marketPriceId" IS NULL
  );

CREATE POLICY "ingredient_delete_policy"
  ON "Ingredient"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "MarketPrice" mp
      INNER JOIN "Supplier" s ON mp."supplierId" = s.id
      WHERE mp.id = "Ingredient"."marketPriceId"
        AND s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
    OR "Ingredient"."marketPriceId" IS NULL
  );

-- ==================== MenuItem ====================
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;

-- MenuItem est global (pas de tenant direct), accessible par tous
CREATE POLICY "menuitem_select_policy"
  ON "MenuItem"
  FOR SELECT
  USING (true);

CREATE POLICY "menuitem_insert_policy"
  ON "MenuItem"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menuitem_update_policy"
  ON "MenuItem"
  FOR UPDATE
  USING (true);

CREATE POLICY "menuitem_delete_policy"
  ON "MenuItem"
  FOR DELETE
  USING (true);

-- ==================== Station ====================
ALTER TABLE "Station" ENABLE ROW LEVEL SECURITY;

-- Station lié à Config → Space → Tenant
CREATE POLICY "station_select_policy"
  ON "Station"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Station"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "station_insert_policy"
  ON "Station"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Station"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "station_update_policy"
  ON "Station"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Station"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "station_delete_policy"
  ON "Station"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Config" c
      INNER JOIN "Space" sp ON c."spaceId" = sp.id
      WHERE c.id = "Station"."configId"
        AND sp."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
