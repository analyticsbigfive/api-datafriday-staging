-- Script pour activer Weezevent sur un tenant
-- Usage: docker-compose exec -T api-dev sh -c "npx prisma db execute --stdin" < scripts/enable-weezevent.sql

-- Activer Weezevent sur le premier tenant trouvé
UPDATE "Tenant" 
SET 
  "weezeventEnabled" = true,
  "weezeventOrganizationId" = '182509'
WHERE "id" IN (
  SELECT "id" FROM "Tenant" LIMIT 1
);

-- Afficher les tenants mis à jour
SELECT 
  "id",
  "name", 
  "slug",
  "weezeventEnabled",
  "weezeventOrganizationId"
FROM "Tenant";
