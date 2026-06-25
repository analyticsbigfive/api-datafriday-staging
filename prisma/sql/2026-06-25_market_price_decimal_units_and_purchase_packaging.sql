-- Market Price — refonte des champs
-- 1) Autoriser les unités décimales (ex: unitsPerPurchase = 1.5)
-- 2) Ajouter l'emballage d'achat (purchasePackaging) distinct de l'emballage de stockage (inventoryPackaging)
--
-- Sûr et additif :
--   - int -> double precision = élargissement de type, aucune perte de données
--   - ADD COLUMN nullable = aucun impact sur les lignes existantes
-- Rejouable (IF NOT EXISTS sur la colonne).

ALTER TABLE "MarketPrice"
  ALTER COLUMN "packedUnits"      TYPE DOUBLE PRECISION USING "packedUnits"::double precision,
  ALTER COLUMN "numberOfUnits"    TYPE DOUBLE PRECISION USING "numberOfUnits"::double precision,
  ALTER COLUMN "unitsPerPurchase" TYPE DOUBLE PRECISION USING "unitsPerPurchase"::double precision;

ALTER TABLE "MarketPrice"
  ADD COLUMN IF NOT EXISTS "purchasePackaging" TEXT;
