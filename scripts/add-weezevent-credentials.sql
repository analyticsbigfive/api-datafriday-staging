-- Script pour ajouter les credentials Weezevent au tenant
-- Usage: cat scripts/add-weezevent-credentials.sql | docker-compose exec -T api-dev sh -c "npx prisma db execute --stdin"

-- Mettre à jour le tenant avec les credentials Weezevent
UPDATE "Tenant" 
SET 
  "weezeventEnabled" = true,
  "weezeventOrganizationId" = '182509',
  "weezeventClientId" = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv',
  "weezeventClientSecret" = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF'
WHERE "id" IN (
  SELECT "id" FROM "Tenant" ORDER BY "createdAt" LIMIT 1
);

-- Afficher le résultat
SELECT 
  "id",
  "name", 
  "slug",
  "weezeventEnabled",
  "weezeventOrganizationId",
  CASE 
    WHEN "weezeventClientId" IS NOT NULL THEN '✅ Configuré'
    ELSE '❌ Non configuré'
  END as credentials_status
FROM "Tenant";
