# API — État du Réarmement (`RestockState`)

Contrat REST à exposer côté backend NestJS pour **persister l'état du Réarmement
en base** (aujourd'hui 100% `localStorage` via `src/data/localDb.js`). Permet de
retrouver son réarmement sur une autre machine / après vidage du cache.

Base URL : `https://datafriday-api.onrender.com/api/v1` (client `src/api/client.js`,
JWT Bearer). Scoping **tenant** via le token ; **un seul état par `spaceId`**.

> ⚠️ Statut au 2026-06-22 : ces routes n'existent pas encore (probe live →
> **404** sur `/spaces/x/restock-state`, `/events/x/restock`, `/restock-state/x`).
> Tant qu'elles n'existent pas, le front reste en localStorage (aucune régression).
> Le front ne sera branché qu'une fois ces routes déployées.

## Décision de design (IMPORTANT)

**`PUT` upsert idempotent keyé `(tenantId, spaceId)`, PAS de `POST` create.**

L'état réarmement est **un document unique par space** (pas une liste de versions).
Donc :
- **pas d'id généré côté client** (évite le bug rencontré sur `EventPredictVersion`
  où id client ≠ id serveur → doublons à chaque écriture) ;
- `PUT` remplace/insère l'unique ligne `(tenantId, spaceId)` → ré-appeler N fois =
  1 seule ligne, jamais de doublon ;
- pas de `404` : si aucun état, `GET` renvoie **200 body `null`** (même convention
  que `GET /inventory/:spaceId/latest`).

## Table (à créer)

`RestockState` :
```
id          (pk)
tenantId    (scoping, depuis le token)
spaceId     (unique avec tenantId)
state       jsonb          -- le blob ci-dessous (RestockStateDto)
createdBy
createdAt
updatedAt

@@unique([tenantId, spaceId])   -- garantit 1 état par space par tenant (upsert)
```

## Endpoints

### 1) Lire l'état réarmement d'un space
```
GET /spaces/{spaceId}/restock-state
→ 200 RestockState   (objet ci-dessous)
→ 200 null           si aucun état enregistré (NE PAS renvoyer 404)
```

### 2) Enregistrer / mettre à jour l'état (UPSERT)
```
PUT /spaces/{spaceId}/restock-state
body: RestockStateDto
→ 200 RestockState   (avec id, updatedAt)
```
Upsert sur `(tenantId, spaceId)` : crée si absent, remplace `state` sinon.
Idempotent — le front l'appelle (débouncé) à chaque changement d'état.

### 3) (Optionnel) Réinitialiser
```
DELETE /spaces/{spaceId}/restock-state
→ 204
```
Correspond au bouton « réinitialiser le réarmement » (front : `clearRestockState`).

## DTO

```ts
// RestockStateDto — exactement le snapshot persisté par le front
// (src/views/SpaceRestockView.vue → restockPersistSnapshot)
{
  objectiveSource: string;          // 'sales' | 'prediction' | … (source de l'objectif)
  referenceEventId: string | null;  // event de référence (mode Ventes)
  selectedEventIds: string[];       // events sélectionnés (0 ou 1 en pratique)
  stockAdjustments: Record<string, number>;   // ajustements stock par item/clé
  stockPackedModes: Record<string, unknown>;  // mode emballé/vrac par item
  restockedRows: Record<string, unknown>;      // lignes confirmées (sorties durables)
  restockGenerated: boolean;        // le tableau de réarmement a été figé
  shoppingGenerated: boolean;       // la feuille de course a été générée
  restockViewMode: string;          // 'shop' | 'item'
}
```

Réponse `RestockState` = `{ id, tenantId, spaceId, state: RestockStateDto,
createdBy, createdAt, updatedAt }`. Le front lit `state` (le reste est ignoré).

## Règles backend

- **Scoping** : filtrer par `tenantId` (token). Vérifier que `spaceId` appartient
  au tenant.
- **Upsert** : transaction sur la contrainte `@@unique([tenantId, spaceId])`.
- **`createdBy`** : depuis le user du token (renseigné à la création seulement).
- **`state`** stocké tel quel en `jsonb` (blob opaque pour le backend — pas de
  validation champ par champ requise au-delà de "objet JSON").

## Mapping front ↔ API (à implémenter une fois les routes en place)

À brancher dans `src/views/SpaceRestockView.vue` + un nouvel endpoint
`src/api/endpoints/restock.api.js`, avec **fallback localStorage conservé** :

- `restoreRestockState()` : `GET …/restock-state` d'abord ; si `null` ou erreur →
  `localDb.getRestockState(spaceId)` (offline). Au succès, miroir LS.
- `persistRestockState(snapshot)` : `PUT …/restock-state` (débouncé, ~500 ms) +
  `localDb.setRestockState` (miroir offline). L'API est la source autoritaire.
- Réutiliser le pattern `apiIsDown()` de `useEventPredictVersions.js` : ne couper
  l'API pour la session que sur réseau/timeout/5xx (jamais sur 4xx).

> Le pont **EventPredict → réarmement** (`predictedRecordsKey`, records pré-calculés)
> reste un cache localStorage : il est dérivé des prédictions, elles-mêmes déjà
> persistées en BDD via `EventPredictVersion`. Le persister séparément en base
> n'est PAS nécessaire (phase 2 éventuelle, non couverte par ce contrat).
