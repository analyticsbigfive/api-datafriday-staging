-- Migration: Enable RLS for Supplier table
-- Description: Suppliers are tenant-scoped

-- Enable RLS
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "supplier_select_policy" 
  ON "Supplier"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- INSERT policy
CREATE POLICY "supplier_insert_policy" 
  ON "Supplier"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- UPDATE policy
CREATE POLICY "supplier_update_policy" 
  ON "Supplier"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

-- DELETE policy
CREATE POLICY "supplier_delete_policy" 
  ON "Supplier"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
