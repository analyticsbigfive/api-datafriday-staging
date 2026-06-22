# Brief DEV — Event Predict : persistance BDD, prix & coûts

Objectif : permettre au front Event Predict (déjà livré) de **persister les
scénarios en base** (au lieu de localStorage) et d'afficher **prix + coûts +
marges réels**. Le front est prêt et fonctionne en localStorage en attendant —
il bascule sur l'API dès que les points ci-dessous sont en place, **sans autre
changement front** (un seul flag à passer).

---

## TL;DR — ce qu'on attend du backend

1. **Exposer 5 routes REST** pour `EventPredictVersion` (CRUD + défaut). → §1
2. **Ajouter 1 colonne** : `EventPredictVersion.selectedTimeRange jsonb`. → §2
3. **Vérifier 2 endpoints existants** renvoient bien les données prix/coût :
   - `/weezevent/products` → `basePrice` non nul. → §3
   - `/mappings/product-menu` → `{ weezeventProductId, menuItemId }`. → §3
   - `MenuItem.totalCost` renseigné (coût agrégé composants/ingrédients/packaging). → §3
4. Quand 1+2 sont prêts : le front passe `REST_ENABLED = true`
   (`src/composables/useEventPredictVersions.js`). → §4

Rien à ajouter pour les **events passés** : `EventPredictVersion.eventId` est
un `text` sans FK → accepte n'importe quel id d'event (passé ou futur). Les jsonb
(`menuConfig`, `quantityAdjustments`, `eventSnapshot`) encaissent les clés des
shops synthétiques Weezevent.

---

## §1 — Routes REST `EventPredictVersion`

Base : `/api/v1` (JWT Bearer, scoping tenant via token). Contrat détaillé +
DTO : `docs/eventPredictVersions.api.md`. Résumé :

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/events/{eventId}/predict-versions` | liste les versions de l'event |
| POST | `/events/{eventId}/predict-versions` | crée une version |
| PATCH | `/predict-versions/{id}` | met à jour (nom, ajustements, snapshot…) |
| DELETE | `/predict-versions/{id}` | supprime |
| PUT | `/events/{eventId}/predict-versions/default` | défaut **exclusif** (body `{versionId|null}`) |

Règles :
- **Défaut exclusif** : `PUT …/default` met `isDefault=true` sur `versionId` et
  `false` sur toutes les autres versions de l'event (transaction). `null` =
  retire le défaut.
- Scoping `tenantId` (token). `createdBy` = user du token.
- La « version active » (en cours d'édition) reste **UI/localStorage** — NE PAS
  la persister.

Payload `POST/PATCH` (CreateEventPredictVersionDto) :
```ts
{
  name: string;                       // requis
  spaceId?: string;
  eventSnapshot: object;              // snapshot complet de l'event au save
  totalRevenue?, adjustedTotalRevenue?, perCapita?, adjustedPerCapita?: number;
  menuConfig?: Record<string, string[]>;        // { elementId: menuItemId[] }
  quantityAdjustments?: Record<string, number>; // { "shopId-itemKey": percent }
  selectedPredictionEventIds?: string[];
  selectedTimeRange?: { start: string|null, end: string|null } | null;
}
```
Réponse = ce DTO + `id, eventId, tenantId, isDefault, createdBy, createdAt, updatedAt`.

⚠️ Le front détecte un faux succès si l'API renvoie **200 sur une route inconnue**
(fallback SPA/proxy). Les routes doivent renvoyer **404** si non trouvées et un
**JSON valide** (tableau pour le GET liste). Sinon le front croit avoir
sauvegardé et perd les données au reload.

---

## §2 — Migration SQL (table existe déjà)

`EventPredictVersion` existe et convient (eventId libre, jsonb). **Une colonne à
ajouter** (le front envoie déjà `selectedTimeRange`) :

```sql
ALTER TABLE public."EventPredictVersion"
  ADD COLUMN IF NOT EXISTS "selectedTimeRange" jsonb;
```

Optionnel — figer coût/marge dans le scénario (sinon recalculés à la volée) :
```sql
ALTER TABLE public."EventPredictVersion"
  ADD COLUMN IF NOT EXISTS "totalCost" double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "adjustedTotalCost" double precision DEFAULT 0;
```

---

## §3 — Prix & coûts (chaîne de données)

Le front reconstruit les items vendus depuis la **timeline** d'un event
(`/spaces/{spaceId}/event-timeline/{eventId}`, champ `weezeventProductId`), puis :

- **Prix** : `weezeventProductId` → `WeezeventProduct.basePrice`
  via `GET /weezevent/products`.
- **Coût** : `weezeventProductId` → `WeezeventProductMapping.menuItemId` →
  `MenuItem.totalCost` via `GET /mappings/product-menu`.
- **Marge** = (CA − coût) / CA.

À vérifier/garantir côté backend :
1. **`GET /weezevent/products`** renvoie `basePrice` non nul (et `id` =
   `weezeventProductId` de la timeline). Si l'endpoint exige un `integrationId`
   pour renvoyer des données, le dire → le front l'ajoutera à l'appel.
2. **`GET /mappings/product-menu`** renvoie les `{ weezeventProductId, menuItemId }`
   du tenant (sans param). Sinon préciser le param attendu (locationId/integrationId).
3. **`MenuItem.totalCost`** doit être **renseigné** (somme
   `MenuItemComponent` + `MenuItemIngredient` + `MenuItemPackaging`). S'il est
   `null`, pas de coût → marge ~100 %. Idéalement le calculer/stocker côté backend.
4. **`/spaces/{spaceId}/event-timeline/{eventId}`** doit continuer à exposer
   `weezeventProductId` par ligne (clé du lien prix/coût).

Ces 3 sources sont **chargées une fois au load du space** et mises dans le store
(`state.analyse.weezeventProducts`, `weezeventProductMappings`) → perf OK.

---

## §4 — Bascule front (une ligne)

`src/composables/useEventPredictVersions.js` :
```js
const REST_ENABLED = false   // → true quand §1 + §2 sont en prod
```
À `true` : load/save/update/delete/default passent par l'API REST
(`src/api/endpoints/eventPredict.api.js`), avec **localStorage en miroir/cache**
(offline + partage immédiat avec le mode Predict). Aucune autre modif front.

---

## Notes d'intégration

- **Partage Event Predict ↔ Predict** : aujourd'hui via localStorage
  (`analyse:event-predict-versions:{eventId}`, `…-default-version:…`,
  `…-active-version:…`). Le store Predict lit ces clés pour appliquer le scénario
  (overlay du CA prédit). Quand on passe en BDD, garder le miroir localStorage
  (déjà géré) pour que Predict continue de lire sans round-trip réseau.
- **Events passés** : un scénario peut viser un event passé (base de prédiction).
  `eventId` libre → aucune contrainte. Rien à faire de spécial.
- **Clés `quantityAdjustments`** : format `"{shopId}-{itemKey}"` où `itemKey` =
  `menuItemId` mappé sinon nom d'item en minuscules (shops Weezevent non mappés).
  Stockées telles quelles en jsonb.
