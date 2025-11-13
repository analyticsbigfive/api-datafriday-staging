-- Migration: Enable RLS for Ingredient table
-- Description: Ingredients are scoped by Product → Supplier (tenant-scoped)

-- Enable RLS
ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "ingredient_all_policy" 
  ON "Ingredient"
  FOR ALL
  USING (
    "productId" IN (
      SELECT p.id FROM "Product" p
      JOIN "Supplier" s ON p."supplierId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
