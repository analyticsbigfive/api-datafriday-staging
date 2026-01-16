-- Activer Weezevent sur TOUS les tenants
UPDATE "Tenant" 
SET 
  "weezeventEnabled" = true,
  "weezeventOrganizationId" = '182509',
  "weezeventClientId" = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv',
  "weezeventClientSecret" = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF'
WHERE "weezeventEnabled" = false;

-- Afficher tous les tenants avec leur statut Weezevent
SELECT 
  "id",
  "name", 
  "slug",
  "weezeventEnabled",
  "weezeventOrganizationId"
FROM "Tenant"
ORDER BY "createdAt" DESC;
