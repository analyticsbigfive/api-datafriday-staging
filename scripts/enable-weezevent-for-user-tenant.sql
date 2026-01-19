-- Activer Weezevent sur le tenant de l'utilisateur actuel
-- IMPORTANT: Le weezeventClientSecret doit être chiffré avec ENCRYPTION_KEY
-- Utiliser le script: node scripts/encrypt-weezevent-secret.js <secret>
UPDATE "Tenant" 
SET 
  "weezeventEnabled" = true,
  "weezeventOrganizationId" = '182509',
  "weezeventClientId" = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv',
  -- Secret chiffré avec AES-256-GCM (format: iv:authTag:encryptedData)
  "weezeventClientSecret" = 'b034974323357368756ef187a2adbbbe:cbd7026e3bfff28d5d6451a52152efff:275196622b195754ebdd034a76d2760a49644e506a77fb5f820e9f96f95b0e1b'
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
