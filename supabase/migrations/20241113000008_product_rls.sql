-- Migration: Enable RLS for Product table
-- Description: Products are scoped by Supplier (tenant-scoped)

-- Enable RLS
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
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
