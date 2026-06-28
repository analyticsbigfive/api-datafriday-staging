-- ============================================================================
-- RÉPARATION des dégâts existants « PDV / Menu Items démappés » (2026-06-28)
-- À exécuter UNE FOIS, après revue. Les sections 1 (DRY-RUN) sont en lecture seule.
-- Les sections 2 (REPAIR) modifient les données : décommenter + exécuter délibérément.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) DRY-RUN (lecture seule) — combien de lignes seraient touchées ?
-- ─────────────────────────────────────────────────────────────────────────

-- 1a. Mappings shop dangling (spaceElementId -> SpaceElement inexistant)
--     → nettoyés automatiquement par la migration FK 20260628120000. Ici pour info.
SELECT 'dangling_shop_mappings' AS repair, count(*) AS rows
FROM "WeezeventLocationShopMapping" m
LEFT JOIN "SpaceElement" se ON se.id = m."spaceElementId"
WHERE se.id IS NULL;

-- 1b. MenuItems soft-deleted MAIS encore référencés par un mapping produit
--     (= « créés et mappés avant, disparus de Menu Items »). Candidats à résurrection.
SELECT 'mapped_but_softdeleted_menuitems' AS repair, count(DISTINCT mi.id) AS rows
FROM "MenuItem" mi
JOIN "WeezeventProductMapping" m ON m."menuItemId" = mi.id
WHERE mi."deletedAt" IS NOT NULL;

-- 1c. Variante "repoint" : ces mappings pour lesquels il existe DÉJÀ un MenuItem ACTIF de
--     même nom (même tenant) → on pourrait repointer le mapping plutôt que ressusciter un doublon.
SELECT 'mappings_repointable_to_active_namesake' AS repair, count(*) AS rows
FROM "WeezeventProductMapping" m
JOIN "MenuItem" dead ON dead.id = m."menuItemId" AND dead."deletedAt" IS NOT NULL
JOIN "MenuItem" live ON live."tenantId" = dead."tenantId"
                    AND lower(live.name) = lower(dead.name)
                    AND live."deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) REPAIR (écritures) — choisir UNE stratégie pour les menu items, puis exécuter.
--    Tout est dans une transaction : COMMIT seulement après vérification.
-- ─────────────────────────────────────────────────────────────────────────

-- BEGIN;

-- 2a. Mappings shop dangling : suppression (déjà fait par la migration FK ; à n'exécuter
--     que si la migration n'a pas encore été appliquée).
-- DELETE FROM "WeezeventLocationShopMapping" m
-- WHERE NOT EXISTS (SELECT 1 FROM "SpaceElement" se WHERE se.id = m."spaceElementId");

-- 2b. STRATÉGIE A (recommandée) — REPOINTER les mappings vers le MenuItem actif de même nom
--     quand il existe (évite les doublons), SINON ressusciter l'item soft-deleted.
-- UPDATE "WeezeventProductMapping" m
-- SET "menuItemId" = live.id, "updatedAt" = now()
-- FROM "MenuItem" dead
-- JOIN "MenuItem" live
--   ON live."tenantId" = dead."tenantId"
--  AND lower(live.name) = lower(dead.name)
--  AND live."deletedAt" IS NULL
-- WHERE m."menuItemId" = dead.id AND dead."deletedAt" IS NOT NULL;
--
-- -- puis ressusciter ceux qui n'avaient pas de jumeau actif
-- UPDATE "MenuItem" SET "deletedAt" = NULL
-- WHERE "deletedAt" IS NOT NULL
--   AND id IN (SELECT "menuItemId" FROM "WeezeventProductMapping");

-- 2c. STRATÉGIE B (plus simple) — RESSUSCITER tous les MenuItems encore mappés
--     (peut recréer des doublons actifs par nom ; à nettoyer ensuite si besoin).
-- UPDATE "MenuItem" SET "deletedAt" = NULL
-- WHERE "deletedAt" IS NOT NULL
--   AND id IN (SELECT "menuItemId" FROM "WeezeventProductMapping");

-- COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) VÉRIFICATION post-repair (doit tomber à 0 sur 1a et 1b)
-- ─────────────────────────────────────────────────────────────────────────
-- (relancer la section 1)
