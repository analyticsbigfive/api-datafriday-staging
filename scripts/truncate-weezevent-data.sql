-- ============================================================
-- TRUNCATE des tables de données Weezevent (sync propre)
-- ============================================================
-- Tables CONSERVÉES (non touchées) :
--   - WeezeventIntegration          (credentials API)
--
-- Usage :
--   psql $DATABASE_URL -f scripts/truncate-weezevent-data.sql
-- ============================================================

BEGIN;

TRUNCATE TABLE
  "WeezeventTransactionItem",
  "WeezeventPayment",
  "WeezeventTransaction",
  "WeezeventAttendee",
  "WeezeventOrder",
  "WeezeventWallet",
  "WeezeventUser",
  "WeezeventPrice",
  "WeezeventProductComponent",
  "WeezeventProductVariant",
  "WeezeventProduct",
  "WeezeventMerchant",
  "WeezeventLocation",
  "WeezeventEvent",
  "WeezeventWebhookEvent",
  "WeezeventSyncState",
  "WeezeventProductMapping",
  "WeezeventLocationSpaceMapping",
  "WeezeventLocationShopMapping"
RESTART IDENTITY CASCADE;

COMMIT;

-- Vérification rapide
SELECT
  (SELECT COUNT(*) FROM "WeezeventTransaction")          AS transactions,
  (SELECT COUNT(*) FROM "WeezeventEvent")                AS events,
  (SELECT COUNT(*) FROM "WeezeventProduct")              AS products,
  (SELECT COUNT(*) FROM "WeezeventLocation")             AS locations,
  (SELECT COUNT(*) FROM "WeezeventMerchant")             AS merchants,
  (SELECT COUNT(*) FROM "WeezeventSyncState")            AS sync_states,
  (SELECT COUNT(*) FROM "WeezeventProductMapping")       AS product_mappings,
  (SELECT COUNT(*) FROM "WeezeventLocationSpaceMapping") AS location_space_mappings,
  (SELECT COUNT(*) FROM "WeezeventLocationShopMapping")  AS location_shop_mappings,
  (SELECT COUNT(*) FROM "WeezeventIntegration")          AS integrations_kept;
