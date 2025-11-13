-- ==========================================
-- RLS POLICIES - DATAFRIDAY MULTI-TENANT
-- ==========================================
-- À exécuter dans Supabase SQL Editor
-- Dashboard → SQL Editor → New Query

-- ==========================================
-- 1. TENANTS
-- ==========================================

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;

-- Les tenants sont visibles uniquement par leurs membres
CREATE POLICY "tenant_select_policy" 
  ON "Tenant"
  FOR SELECT
  USING (
    id::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- Seuls les admins système peuvent créer des tenants (géré en app)
CREATE POLICY "tenant_insert_policy" 
  ON "Tenant"
  FOR INSERT
  WITH CHECK (false); -- Désactivé, création via API uniquement

-- ==========================================
-- 2. USERS
-- ==========================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Les users voient uniquement ceux de leur tenant
CREATE POLICY "user_select_policy" 
  ON "User"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- Insertion uniquement dans son propre tenant
CREATE POLICY "user_insert_policy" 
  ON "User"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- Update uniquement dans son tenant
CREATE POLICY "user_update_policy" 
  ON "User"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- Delete uniquement dans son tenant
CREATE POLICY "user_delete_policy" 
  ON "User"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- ==========================================
-- 3. SPACES
-- ==========================================

ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "space_select_policy" 
  ON "Space"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "space_insert_policy" 
  ON "Space"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "space_update_policy" 
  ON "Space"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "space_delete_policy" 
  ON "Space"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- ==========================================
-- 4. SUPPLIERS
-- ==========================================

ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_select_policy" 
  ON "Supplier"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "supplier_insert_policy" 
  ON "Supplier"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "supplier_update_policy" 
  ON "Supplier"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "supplier_delete_policy" 
  ON "Supplier"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- ==========================================
-- 5. CONFIGS (Global settings par tenant)
-- ==========================================

ALTER TABLE "Config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_select_policy" 
  ON "Config"
  FOR SELECT
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_insert_policy" 
  ON "Config"
  FOR INSERT
  WITH CHECK (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_update_policy" 
  ON "Config"
  FOR UPDATE
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

CREATE POLICY "config_delete_policy" 
  ON "Config"
  FOR DELETE
  USING (
    "spaceId" IN (
      SELECT id FROM "Space" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==========================================
-- 6. FLOORS
-- ==========================================

ALTER TABLE "Floor" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 7. POINTS OF SALE (POS)
-- ==========================================

ALTER TABLE "PointOfSale" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 8. PRODUCTS
-- ==========================================

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_all_policy" 
  ON "Product"
  FOR ALL
  USING (
    "supplierId" IN (
      SELECT id FROM "Supplier" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  )
  WITH CHECK (
    "supplierId" IN (
      SELECT id FROM "Supplier" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==========================================
-- 9. MARKET PRICES
-- ==========================================

ALTER TABLE "MarketPrice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_price_all_policy" 
  ON "MarketPrice"
  FOR ALL
  USING (
    "productId" IN (
      SELECT id FROM "Product" p
      JOIN "Supplier" s ON p."supplierId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==========================================
-- 10. INGREDIENTS
-- ==========================================

ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_all_policy" 
  ON "Ingredient"
  FOR ALL
  USING (
    "productId" IN (
      SELECT id FROM "Product" p
      JOIN "Supplier" s ON p."supplierId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==========================================
-- 11. MENUS
-- ==========================================

ALTER TABLE "Menu" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 12. MENU ITEMS
-- ==========================================

ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 13. STATIONS
-- ==========================================

ALTER TABLE "Station" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 14. EVENTS
-- ==========================================

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;

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

-- ==========================================
-- 15. STOCKS
-- ==========================================

ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_all_policy" 
  ON "Stock"
  FOR ALL
  USING (
    "productId" IN (
      SELECT p.id FROM "Product" p
      JOIN "Supplier" s ON p."supplierId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- ==========================================
-- VÉRIFICATION
-- ==========================================

-- Lister toutes les policies créées
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Vérifier les tables avec RLS activé
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = true;
