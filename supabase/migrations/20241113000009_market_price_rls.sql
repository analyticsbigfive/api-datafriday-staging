-- Migration: Enable RLS for MarketPrice table
-- Description: Market prices are scoped by Product → Supplier (tenant-scoped)

-- Enable RLS
ALTER TABLE "MarketPrice" ENABLE ROW LEVEL SECURITY;

-- ALL operations policy
CREATE POLICY "market_price_all_policy" 
  ON "MarketPrice"
  FOR ALL
  USING (
    "productId" IN (
      SELECT p.id FROM "Product" p
      JOIN "Supplier" s ON p."supplierId" = s.id
      WHERE s."tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
