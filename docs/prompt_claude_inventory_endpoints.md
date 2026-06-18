# Prompt Claude Code — Implémenter le module Inventory (NestJS)

## Contexte

API NestJS (versionnée `/api/v1`, Swagger → `openapi.json`). Espace Weezevent (ex : `space: Auxerre`). Le front appelle des routes Inventory qui **n'existent pas** côté backend : toutes répondent **404** (et non 401), aucune n'apparaît dans `openapi.json`. Le module Inventory n'a jamais été implémenté. Le front catch le 404 et bascule en fallback localStorage → les comptages **ne sont pas persistés serveur**.

Note : `/packaging-types` était un mauvais chemin côté front, déjà corrigé en `/packaging` (route existante). Ne pas y toucher.

## Objectif

Implémenter le module Inventory complet pour exposer ces 4 routes, alignées sur le contrat front (`inventory.api.js`) :

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/v1/inventory/:spaceId/:eventId` | Inventaire d'un event donné |
| GET | `/api/v1/inventory/:spaceId/latest` | Dernier inventaire enregistré pour un space |
| POST | `/api/v1/inventory` | Créer / upsert un inventaire (clé `spaceId` + `eventId`) |
| POST | `/api/v1/inventory-counts` | Enregistrer les comptages (lignes de comptage) |

## Spécifications

1. **Module** : `InventoryModule` (controller + service + entités + DTOs), branché dans `AppModule`, sous le préfixe global `/api/v1`.
2. **Persistance** : créer les entités `Inventory` et `InventoryCount` (ORM en place dans le projet — réutiliser l'existant, ne pas introduire un nouvel ORM). Migration incluse.
   - `Inventory` : `id`, `spaceId`, `eventId`, `createdAt`, `updatedAt`, relation 1-N vers `InventoryCount`.
   - `InventoryCount` : `id`, `inventoryId`, `packagingId` (réf. `/packaging`), `quantity`, éventuellement `shopId`, `countedAt`.
   - Upsert `Inventory` sur la clé composite `(spaceId, eventId)` pour `POST /inventory`.
3. **GET `/:spaceId/:eventId`** : retourne l'inventaire + ses comptages, ou **404 propre** si aucun (le front gère déjà ce 404 → ne pas changer ce comportement attendu).
4. **GET `/:spaceId/latest`** : dernier `Inventory` du space par `updatedAt` desc.
5. **DTOs validés** (`class-validator`) pour les deux POST. `POST /inventory-counts` accepte un tableau de lignes rattachées à un `inventoryId` (ou `spaceId`+`eventId` → résoudre/créer l'inventaire).
6. **Réponses** : forme JSON cohérente avec ce que le store front consomme (le store accepte `data` ou `data.data` → exposer un objet direct ou wrappé selon la convention déjà en place dans les autres controllers du projet — vérifier un controller existant et s'aligner).
7. **Swagger** : décorer (`@ApiTags('inventory')`, `@ApiOkResponse`, etc.) pour que les 4 routes apparaissent dans `openapi.json`.
8. **Auth** : appliquer le même guard/garde que les autres modules protégés (sans token → 401, pas 404).

## Contraintes

- Suivre les conventions du repo (structure de dossiers, nommage, style des controllers/services existants — lire 2-3 modules voisins avant d'écrire).
- Pas de breaking change sur `/packaging`.
- Code typé strict, validation des entrées, gestion d'erreurs explicite.

## Critères de vérification

- Probe sans token sur les 4 routes → **401** (la route existe), plus aucun **404 « route inexistante »**.
- `GET /inventory/:spaceId/:eventId` sans données → **404 métier propre** (toujours géré par le front).
- Les 4 routes apparaissent dans `openapi.json`.
- Aller-retour POST → GET : un inventaire posté est relu correctement (persistance serveur OK, plus de dépendance localStorage).
- Recharger la page Inventory : onglet Réseau → `/packaging` 200, `/inventory/...` 200 (ou 404 métier si vide), plus de 404 route.

## Livrable

Module Inventory complet (controller, service, entités, DTOs, migration, décorateurs Swagger), prêt à committer. Résume en fin de tâche les fichiers créés/modifiés et la commande de migration à lancer.
