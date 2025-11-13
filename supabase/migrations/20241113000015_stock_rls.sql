-- Migration: Enable RLS for Stock table
-- Description: Stocks are scoped by Product → Supplier (tenant-scoped)

-- Enable RLS
ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
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
