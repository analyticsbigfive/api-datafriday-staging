-- =============================================================================
-- Migration : Wizard d'intégration Weezevent — correctifs A1/A6/A21
-- Date      : 2026-06-26
-- Cible     : PostgreSQL (Prisma datasource)
-- Voir      : docs/ANALYSE_WIZARD_WEEZEVENT_ANOMALIES.md
--
-- Contenu :
--   1. Schéma : Config.isSystem + Config.version, modèle ExternalMerch, FK SpaceElement.externalMerchId
--   2. Backfill : marquer isSystem=true sur les configs internes "Weezevent Import" existantes
--   3. Détection (lecture seule) des doublons de config système par space
--
-- ⚠️ Appliquer de préférence via `prisma migrate deploy` (générer la migration avec
--    `prisma migrate dev --name add_external_merch_and_config_issystem`). Ce fichier SQL
--    reproduit exactement le delta produit par `prisma migrate diff` + le backfill métier.
--    Déployer le BACKEND (ce schéma + le code) AVANT le frontend qui filtre sur `isSystem`.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SCHÉMA (delta `prisma migrate diff`)
-- ---------------------------------------------------------------------------

-- Config : flag de config interne + verrou optimiste de synchronisation JSON
ALTER TABLE "Config"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "version"  INTEGER NOT NULL DEFAULT 0;

-- SpaceElement : FK vers la nouvelle zone External Merch
ALTER TABLE "SpaceElement" ADD COLUMN "externalMerchId" TEXT;

-- Nouvelle zone "External Merch" (miroir de Forecourt)
CREATE TABLE "ExternalMerch" (
    "id"       TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "width"    DOUBLE PRECISION NOT NULL,
    "length"   DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ExternalMerch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalMerch_configId_key" ON "ExternalMerch"("configId");
CREATE INDEX "SpaceElement_externalMerchId_idx" ON "SpaceElement"("externalMerchId");

ALTER TABLE "SpaceElement"
  ADD CONSTRAINT "SpaceElement_externalMerchId_fkey"
  FOREIGN KEY ("externalMerchId") REFERENCES "ExternalMerch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalMerch"
  ADD CONSTRAINT "ExternalMerch_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "Config"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. BACKFILL : configs internes existantes
-- ---------------------------------------------------------------------------
-- Le backend crée la config interne avec le nom EXACT 'Weezevent Import' (PascalCase).
-- ⚠️ NE PAS matcher 'weezevent import' (lowercase) : c'était le DÉFAUT du wizard avant le
--    correctif A2 → potentiellement des configs UTILISATEUR à NE PAS masquer.
UPDATE "Config" SET "isSystem" = true WHERE "name" = 'Weezevent Import';

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. CONTRÔLE POST-MIGRATION (lecture seule) — à exécuter séparément
-- ---------------------------------------------------------------------------
-- Détecter d'éventuels doublons de config système par space (le find-or-create
-- case-sensitive a pu en créer avant la migration). À fusionner manuellement si > 0
-- AVANT de poser un éventuel index unique partiel.
--
--   SELECT "spaceId", COUNT(*) AS nb
--   FROM "Config" WHERE "isSystem" = true
--   GROUP BY "spaceId" HAVING COUNT(*) > 1;
--
-- (Optionnel) Garantir une seule config système par space après dédoublonnage :
--   CREATE UNIQUE INDEX "config_one_system_per_space"
--     ON "Config" ("spaceId") WHERE "isSystem" = true;
