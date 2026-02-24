-- =====================================================================
-- Row-Level Security (RLS) Policies for Multi-Tenant Isolation
-- Run this on your Supabase PostgreSQL database
-- =====================================================================

-- Helper: Extract tenant_id from JWT claims
-- Supabase stores custom claims in auth.jwt() -> 'app_metadata' -> 'tenant_id'
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT AS $$
  SELECT coalesce(
    current_setting('app.current_tenant_id', true),
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =====================================================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- =====================================================================

-- Core business tables
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Packaging" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CsvMapping" ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- POLICIES: Each tenant can only access their own data
-- =====================================================================

-- Space
CREATE POLICY "tenant_isolation" ON "Space"
  USING ("tenantId" = public.current_tenant_id());

-- Config (via Space)
CREATE POLICY "tenant_isolation" ON "Config"
  USING ("spaceId" IN (
    SELECT id FROM "Space" WHERE "tenantId" = public.current_tenant_id()
  ));

-- MenuItem
CREATE POLICY "tenant_isolation" ON "MenuItem"
  USING ("tenantId" = public.current_tenant_id());

-- MenuComponent
CREATE POLICY "tenant_isolation" ON "MenuComponent"
  USING ("tenantId" = public.current_tenant_id());

-- Ingredient
CREATE POLICY "tenant_isolation" ON "Ingredient"
  USING ("tenantId" = public.current_tenant_id());

-- Packaging
CREATE POLICY "tenant_isolation" ON "Packaging"
  USING ("tenantId" = public.current_tenant_id());

-- Supplier
CREATE POLICY "tenant_isolation" ON "Supplier"
  USING ("tenantId" = public.current_tenant_id());

-- MarketPrice
CREATE POLICY "tenant_isolation" ON "MarketPrice"
  USING ("tenantId" = public.current_tenant_id());

-- CsvMapping
CREATE POLICY "tenant_isolation" ON "CsvMapping"
  USING ("tenantId" = public.current_tenant_id());

-- =====================================================================
-- SERVICE ROLE BYPASS
-- The NestJS API uses the service_role key which bypasses RLS.
-- These policies protect against direct Supabase client access
-- (e.g., from a future mobile app or Supabase JS client).
-- =====================================================================

-- Grant the service role full access (NestJS backend)
-- This is already handled by Supabase's service_role key which bypasses RLS.

-- =====================================================================
-- NOTES:
-- 1. RLS is a defense-in-depth layer. The NestJS services already
--    filter by tenantId in all queries.
-- 2. RLS protects against:
--    - Direct Supabase client access without proper tenant context
--    - SQL injection that bypasses application-level filters
--    - Future client SDKs accessing Supabase directly
-- 3. To set tenant context from NestJS before raw queries:
--    SET LOCAL app.current_tenant_id = 'tenant_xxx';
-- =====================================================================
