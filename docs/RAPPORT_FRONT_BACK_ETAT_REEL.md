# Rapport front/back — état réel des routes (2026-06-18)

Ce document clarifie ce qui fonctionne, ce qui est cassé, et ce qui doit changer
de quel côté (front ou back) avant de démarrer les développements P0/P1.

---

## 1. Architecture deux backends (point critique)

Le frontend n'appelle **pas** un seul backend. Il y en a deux :

| Backend | URL | Utilisé par |
|---|---|---|
| **Supabase Edge Function** | `https://<project>.supabase.co/functions/v1/make-server-eb31619c` | `src/utils/api.js` |
| **NestJS** | `VUE_APP_API_URL` (Render) | `src/api/endpoints/*.api.js` via `client.js` (Axios + JWT) |

Toutes les routes listées dans `BACKEND_A_CREER_CONSOLIDE.md` ciblent NestJS —
**sauf** les appels KV (`getKVData` / `setKVData`) qui vont sur la Supabase Edge Function.

---

## 2. État route par route

### 2.1 Inventory — `POST /inventory`, `GET /inventory/:spaceId/:eventId`, etc.

**Appelé par** : `src/api/endpoints/inventory.api.js` → NestJS.

| Route | Existe côté NestJS ? | Fonctionne ? | Problème |
|---|---|---|---|
| `GET /inventory/:spaceId/:eventId` | Oui | **Non** | Ne retourne pas `inventoryCounts` dans la réponse |
| `GET /inventory/:spaceId/latest` | Oui | Partiel | Pas de champ `inventoryCounts` |
| `POST /inventory` | Oui | **Non** | DTO sans champ `inventoryCounts` → payload silencieusement ignoré |
| `POST /inventory-counts` | Oui | **Non** | Shape incompatible (voir ci-dessous) |

**Shape envoyée par `POST /inventory`** (store `inventory.js`) :
```json
{
  "spaceId": "...",
  "eventId": "...",
  "inventoryCounts": {
    "shop-id": {
      "item-id": {
        "itemId": "item-id",
        "packedUnits": 2,
        "looseUnits": 5,
        "isCounted": true,
        "storageLocation": null,
        "countingStatus": "counted"
      }
    }
  }
}
```

**Shape envoyée par `POST /inventory-counts`** (store `inventory.js`, action `upsertCount`) :
```json
{
  "spaceId": "...",
  "eventId": "...",
  "shopId": "...",
  "itemId": "...",
  "packedUnits": 2,
  "looseUnits": 5,
  "isCounted": true,
  "storageLocation": null,
  "countingStatus": "counted"
}
```

**Shape attendue par le store en `GET /inventory/:spaceId/:eventId`** :
```json
{
  "inventoryCounts": {
    "shop-id": {
      "item-id": { "packedUnits": 2, "looseUnits": 5, "isCounted": true, ... }
    }
  }
}
```

**Conséquence actuelle** : le back reçoit tout, ignore `inventoryCounts`, retourne
un objet sans ce champ → le store tombe sur le fallback localStorage.
Ca fonctionne sur un seul navigateur, **pas cross-device ni multi-user**.

**Action requise** : côté **backend uniquement** (pas de changement front).
Voir `BACKEND_A_CREER_CONSOLIDE.md` §1 — nouveau modèle `InventorySnapshot (Json)` +
réécriture DTO/service.

---

### 2.2 Event Predict versions — KV

**Appelé par** : `src/composables/useEventPredictVersions.js`
→ `getKVData` / `setKVData` depuis **`utils/api.js`**
→ cible la **Supabase Edge Function**, PAS NestJS.

Clés utilisées :
```
event-predict-versions:<eventId>
event-predict-default-version:<eventId>
event-predict-active-version:<eventId>
```

**Conséquence** : ajouter `GET/PUT /kv/:key` à NestJS ne changera rien
tant que `utils/api.js` pointe sur la Supabase Edge Function.

**Options** :

| Option | Effort front | Effort back | Recommandation |
|---|---|---|---|
| A. Ajouter KV dans la Supabase Edge Function | 0 | Faible (Edge Function) | Court terme |
| B. Modifier `utils/api.js` pour pointer vers NestJS | Faible | Créer `GET/PUT /kv/:key` | Moyen terme |
| C. Migrer vers routes dédiées `/events/:eventId/predict-versions` | Moyen | Moyen | Long terme, propre |

**Action requise** : décision produit à prendre **avant** de démarrer le dev.
Le front doit confirmer quelle option il cible.

---

### 2.3 Analyse timeline event

**Appelé par** : `src/composables/useAnalyseTimeline.js`
→ `getSpaceEventTimeline(spaceId, ev.id)` depuis `src/api/endpoints/space.api.js`
→ `GET /spaces/${spaceId}/event-timeline/${eventId}` sur NestJS.

**Cette route existe déjà** dans `spaces.controller.ts` (ligne 492).
Elle retourne les transactions agrégées par minute × shop × article.

`BACKEND_A_CREER_CONSOLIDE.md` mentionne `GET /analyse/timeline/:eventId` comme
manquant — c'est une confusion avec `GET /aggregation/events-timeline/{spaceId}`
(qui est le statut de traitement des events, pas la timeline ventes).

**Action requise** : **rien**. La route est déjà implémentée et fonctionnelle.
À vérifier simplement que le front l'appelle bien avec le bon `spaceId` + `eventId`.

---

### 2.4 Swagger / OpenAPI public

**Situation** : `src/main.ts` expose Swagger uniquement `if (!isProd)`.
En production (`datafriday-api.onrender.com`) : aucun accès à `/api/v1/docs`.

**Action requise** : côté **backend uniquement**.
Enlever le guard `if (!isProd)` + exposer `/api/v1/openapi.json`.

---

### 2.5 Packaging

**Appelé par** : `src/api/endpoints/inventory.api.js` → `GET /packaging` sur NestJS.

Route déjà documentée dans `openapi.json`. **Rien à créer.**

---

## 3. Tableau de synthèse

| Item | Route(s) | Existe ? | Cassé ? | Action | Côté |
|---|---|---|---|---|---|
| Swagger prod | `/api/v1/docs`, `/api/v1/openapi.json` | Désactivé | Oui | Enlever guard `isProd` | Back |
| Inventory snapshot | `POST /inventory` | Oui | Oui (DTO vide) | Nouveau modèle + réécriture service | Back |
| Inventory GET | `GET /inventory/:spaceId/:eventId` | Oui | Oui (pas `inventoryCounts`) | Retourner dernier snapshot | Back |
| Inventory counts | `POST /inventory-counts` | Oui | Oui (shape incompatible) | Réécrire DTO | Back |
| Event Predict KV | `GET/PUT /kv/:key` | Non dans NestJS | — | Décision option A/B/C | **Front + Back** |
| Analyse timeline | `GET /spaces/:id/event-timeline/:eventId` | **Oui** | Non | Rien | — |
| Packaging | `GET /packaging` | Oui | Non | Rien | — |

---

## 4. Ce que le front n'a pas à changer pour P0/P1

Si le backend implémente correctement les items ci-dessus :

- `POST /inventory` : **aucun changement front** — le store envoie déjà la bonne shape
- `GET /inventory/:spaceId/:eventId` : **aucun changement front** — le store lit déjà `remote.inventoryCounts`
- `POST /inventory-counts` : **aucun changement front** — le store envoie déjà la bonne shape
- Swagger : **aucun changement front**

**Seul item nécessitant une coordination front/back** : Event Predict KV (option à décider ensemble).

---

## 5. Questions ouvertes pour le front

1. **KV / Event Predict** : quelle option tu vises — A (Supabase Edge Function), B (NestJS via `utils/api.js`), ou C (migration vers routes dédiées) ?
2. **Inventory canonical** (`GET/POST /spaces/:spaceId/inventory-counts`) : tu as besoin de ces routes pour de nouveaux écrans prévus, ou on garde juste les compat `/inventory*` pour l'instant ?
3. **`GET /inventory/:spaceId/latest`** : est-ce que cette route est réellement utilisée quelque part dans le front, ou c'est préventif ?
