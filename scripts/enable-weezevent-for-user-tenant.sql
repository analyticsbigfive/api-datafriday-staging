-- Activer Weezevent sur le tenant de l'utilisateur actuel
UPDATE "Tenant" 
SET 
  "weezeventEnabled" = true,
  "weezeventOrganizationId" = '182509',
  "weezeventClientId" = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv',
  "weezeventClientSecret" = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF'
WHERE "id" = 'cmj8nq42a000113pfk28ns4fa';

-- Vérification
SELECT 
  "id",
  "name", 
  "slug",
  "weezeventEnabled",
  "weezeventOrganizationId",
  CASE 
    WHEN "weezeventClientId" IS NOT NULL THEN '✅ Configuré'
    ELSE '❌ Non configuré'
  END as weezevent_status
FROM "Tenant"
WHERE "id" = 'cmj8nq42a000113pfk28ns4fa';
