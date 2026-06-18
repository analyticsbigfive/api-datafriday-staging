# Backend - version consolidee des modules a creer

Date: 2026-06-18  
Base API cible: `https://datafriday-api.onrender.com/api/v1`

Sources consolidees:
- `docs/ulrich-api-endpoints.md`
- `docs/ulrich-nestjs-changes.md`
- `docs/BACKEND_KV_EVENT_PREDICT.md`
- `docs/portage-spaceinventory-events.md`
- `openapi.json`
- appels front: `src/api/endpoints/inventory.api.js`, `src/store/modules/inventory.js`

## Etat constate

`openapi.json` expose deja:

- `GET/POST /api/v1/packaging`
- `GET/PATCH/DELETE /api/v1/packaging/{id}`
- routes packagings liees aux menu items / market prices

`openapi.json` n'expose pas:

- `/api/v1/inventory`
- `/api/v1/inventory-counts`
- `/api/v1/spaces/{spaceId}/inventory-counts`
- `/api/v1/events/{eventId}/predict-versions`
- `/api/v1/analyse/timeline/{eventId}`
- `/api/v1/analyse/prediction-metrics`
- `/api/v1/events/{eventId}/stockup`
- `/api/v1/kv/{key}`

Symptome actuel confirme cote front:

```txt
POST /api/v1/inventory -> 404
```

Resultat: inventaire et versions Event Predict retombent sur `localStorage`.
Ca marche sur le meme navigateur, mais pas cross-device / multi-user.

## Priorites

| Priorite | Module | A creer | Effort estime | Pourquoi |
|---|---|---:|---:|---|
| P0 | Swagger/OpenAPI public | Oui | 0.25 j | Spec backend fiable, contrats front/backend |
| P1 | Inventory compat front | Oui | 0.5-1 j | Corrige le 404 `/inventory` sans attendre refonte |
| P1 | Event Predict versions | Oui | 0.5-1 j | Versions partageables, plus de localStorage seul |
| P1 | Analyse timeline event | Oui | 1-2 j | Lazy-load timeline reel, plus de mock |
| P2 | Space inventory canonique | Oui | 1-1.5 j | API propre et durable pour inventaire |
| P2 | Prediction metrics | Si scoring backend | 2-3 j | Centralise les calculs predictifs |
| P3 | Stockup | Optionnel | 0.5 j | Export / aggregation serveur |
| P3 | Cache diagnostic / hygiene spec | Oui | 0.25 j | Routes consommees mais non documentees |

Phase courte recommandee: P0 + P1. Effort: environ 2-4 jours.

## Strategie routes

Deux familles existent dans les docs:

1. Routes actuellement appelees par le front Vue:

```txt
GET  /inventory/:spaceId/:eventId
GET  /inventory/:spaceId/latest
POST /inventory
POST /inventory-counts
GET  /packaging
```

2. Routes REST canoniques recommandees:

```txt
GET    /spaces/:spaceId/inventory-counts?eventId=...
POST   /spaces/:spaceId/inventory-counts
PATCH  /spaces/:spaceId/inventory-counts/:countId
DELETE /spaces/:spaceId/inventory-counts/:countId
GET    /spaces/:spaceId/inventory-counts/summary?eventId=...
```

Decision recommandee:

- Creer d'abord les routes compat front (`/inventory*`, `/inventory-counts`) pour supprimer le 404 sans changement front.
- Creer ensuite les routes canoniques `/spaces/:spaceId/inventory-counts`.
- Garder les routes compat comme alias pendant migration front.

## 1. Module Inventory - compat front

But: faire fonctionner ce que le front appelle deja aujourd'hui.

### Endpoints a creer

| Methode | URL | Body | Reponse attendue |
|---|---|---|---|
| GET | `/inventory/:spaceId/:eventId` | - | `{ inventoryCounts, spaceId, eventId, updatedAt }` ou `404` |
| GET | `/inventory/:spaceId/latest` | - | dernier snapshot connu du space |
| POST | `/inventory` | `{ spaceId, eventId, inventoryCounts }` | snapshot sauvegarde |
| POST | `/inventory-counts` | count unitaire | count sauvegarde |

Payload exact envoye par `POST /inventory`:

```json
{
  "spaceId": "space-id",
  "eventId": "event-id",
  "inventoryCounts": {
    "shop-id": {
      "item-id": {
        "itemId": "item-id",
        "packedUnits": 2,
        "looseUnits": 5,
        "isCounted": true,
        "eventId": "event-id",
        "storageLocation": null,
        "countingStatus": "counted"
      }
    }
  }
}
```

Payload exact envoye par `POST /inventory-counts`:

```json
{
  "spaceId": "space-id",
  "eventId": "event-id",
  "shopId": "shop-id",
  "itemId": "item-id",
  "packedUnits": 2,
  "looseUnits": 5,
  "isCounted": true,
  "storageLocation": null,
  "countingStatus": "counted"
}
```

### Modele DB minimum

```prisma
model InventorySnapshot {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String?  @db.Uuid
  spaceId         String   @db.Uuid
  eventId         String?  @db.Uuid
  inventoryCounts Json
  createdBy       String?  @db.Uuid
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([tenantId])
  @@index([spaceId, eventId])
  @@index([spaceId, createdAt])
}

model InventoryCount {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String?  @db.Uuid
  spaceId           String   @db.Uuid
  eventId           String?  @db.Uuid
  shopId            String?  @db.Uuid
  itemId            String   @db.Uuid
  packedUnits       Int      @default(0)
  looseUnits        Int      @default(0)
  isCounted         Boolean  @default(false)
  storageLocation   String?
  countingStatus    String   @default("pending")
  discardedQuantity Int      @default(0)
  discardedReason   String?
  countedBy         String?  @db.Uuid
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([tenantId])
  @@index([spaceId, eventId])
  @@index([shopId])
  @@index([itemId])
  @@unique([spaceId, eventId, shopId, itemId], name: "uniq_inventory_count")
}
```

### Comportement attendu

- `POST /inventory`: creer un snapshot horodate. Ne pas seulement ecraser l'ancien.
- `GET /inventory/:spaceId/:eventId`: retourner le dernier snapshot pour ce couple.
- `GET /inventory/:spaceId/latest`: retourner le dernier snapshot du space, tous events confondus.
- `POST /inventory-counts`: upsert par `(spaceId, eventId, shopId, itemId)`.
- Tous les endpoints proteges par JWT Supabase.
- Donnees scopees par tenant/org si le backend a deja cette notion.

## 2. Module Space Inventory - routes canoniques

But: API durable, plus REST, utilisable par les prochains ecrans.

### Endpoints a creer

| Methode | URL | Reponse / body |
|---|---|---|
| GET | `/spaces/:spaceId/inventory-counts?eventId=...` | `InventoryCount[]` |
| POST | `/spaces/:spaceId/inventory-counts` | `InventoryCount` |
| PATCH | `/spaces/:spaceId/inventory-counts/:countId` | `Partial<InventoryCount>` |
| DELETE | `/spaces/:spaceId/inventory-counts/:countId` | `204` |
| GET | `/spaces/:spaceId/inventory-counts/summary?eventId=...` | resume inventaire |

Resume attendu:

```ts
type InventorySummary = {
  totalItems: number
  countedItems: number
  pendingItems: number
  discardedItems: number
  byShop: Array<{ shopId: string; shopName: string; totalItems: number; countedItems: number }>
  byStorage: Array<{ storageLocation: string | null; totalItems: number; countedItems: number }>
}
```

## 3. Module Event Predict versions

But: remplacer le stockage navigateur des versions predictives.

### Endpoint minimum rapide

Si objectif = zero changement front immediat:

```txt
GET /kv/:key
PUT /kv/:key
```

Cles utilisees:

```txt
event-predict-versions:<eventId>
event-predict-default-version:<eventId>
event-predict-active-version:<eventId>
```

Table minimum:

```sql
create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  tenant_id uuid,
  updated_at timestamptz default now()
);
```

### Endpoint durable recommande

```txt
GET    /events/:eventId/predict-versions
GET    /events/:eventId/predict-versions/:versionId
POST   /events/:eventId/predict-versions
PUT    /events/:eventId/predict-versions/:versionId
DELETE /events/:eventId/predict-versions/:versionId
PUT    /events/:eventId/predict-default-version
```

Modele:

```prisma
model EventPredictVersion {
  id                         String   @id @default(uuid()) @db.Uuid
  tenantId                   String?  @db.Uuid
  eventId                    String   @db.Uuid
  spaceId                    String?  @db.Uuid
  name                       String
  isDefault                  Boolean  @default(false)
  eventSnapshot              Json
  totalRevenue               Float    @default(0)
  adjustedTotalRevenue       Float    @default(0)
  perCapita                  Float    @default(0)
  adjustedPerCapita          Float    @default(0)
  menuConfig                 Json
  quantityAdjustments        Json
  selectedPredictionEventIds String[]
  createdBy                  String?  @db.Uuid
  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  @@index([tenantId])
  @@index([eventId])
  @@index([spaceId])
}
```

Regle importante: une seule version default par event. Faire `unset` des autres
versions en transaction quand `PUT /predict-default-version`.

## 4. Module Analyse timeline event

But: fournir la timeline brute par event, actuellement mockee cote front.

Endpoint attendu:

```txt
GET /analyse/timeline/:eventId?startTime=HH:MM&endTime=HH:MM&shopId=...&menuItemId=...&limit=1000&cursor=...
```

Reponse:

```ts
type TimelineRecord = {
  eventId: string
  shopId: string
  shopName: string
  menuItemId: string
  menuItemName: string
  hour: number
  minute?: string
  quantity: number
  revenue: number
  transactionCount: number
}
```

Note: `openapi.json` contient deja `/aggregation/events-timeline/{spaceId}`,
mais cette route retourne le statut de traitement des events. Ce n'est pas la
timeline ventes par minute attendue par Analyse.

Recommandations:

- materialized view `timeline_minute` ou aggregation equivalente.
- pagination obligatoire pour gros events.
- `Cache-Control: private, max-age=60`.
- index DB: `(eventId, shopId)`, `(eventId, menuItemId)`, `(eventId, minute)`.

## 5. Module Prediction metrics

But: centraliser les agregats predictifs si le scoring doit sortir du front.

Endpoint:

```txt
GET /analyse/prediction-metrics?eventId=...&configurationId=...
```

Reponse:

```ts
type PredictionMetrics = {
  eventId: string
  configurationId: string
  revenue: number
  cost: number
  margin: number
  transactions: number
  attendees: number
  perCapita: number
  avgPerTransaction: number
}
```

Decision produit: optionnel si le calcul reste cote front.

## 6. Module Stockup

But: fournir aggregation rearmement cote serveur.

Endpoint:

```txt
GET /events/:eventId/stockup?view=shop|item&configurationId=...
```

Reponse `view=shop`:

```ts
type StockupByShop = Array<{
  shopId: string
  shopName: string
  items: Array<{
    menuItemId: string
    menuItemName: string
    category: string | null
    type: string | null
    quantity: number
    revenue: number
  }>
}>
```

Reponse `view=item`:

```ts
type StockupByItem = Array<{
  menuItemId: string
  menuItemName: string
  category: string | null
  type: string | null
  totalQuantity: number
  totalRevenue: number
  byShop: Array<{ shopId: string; shopName: string; quantity: number; revenue: number }>
}>
```

Priorite basse: le front sait deja calculer une partie.

## 7. Packaging

Action principale: verifier, pas recreer.

OpenAPI documente deja:

```txt
GET  /packaging
POST /packaging
GET  /packaging/:id
PATCH /packaging/:id
DELETE /packaging/:id
```

Le front actuel appelle `GET /packaging`, pas `/packaging-types`.

Compat optionnelle si vieux code React encore utilise:

```txt
GET /packaging-types -> alias de GET /packaging
```

## 8. Swagger / OpenAPI public

But: eviter spec statique desynchronisee.

Routes a exposer:

```txt
GET /api/v1/docs
GET /api/v1/openapi.json
```

NestJS:

```ts
const config = new DocumentBuilder()
  .setTitle('DataFriday API')
  .setVersion('1.0')
  .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'supabase-jwt')
  .build()

const document = SwaggerModule.createDocument(app, config)
SwaggerModule.setup('api/v1/docs', app, document)
app.use('/api/v1/openapi.json', (_req, res) => res.json(document))
```

Acceptance:

- spec contient toutes les routes ci-dessus.
- spec se regenere depuis backend, plus de copie manuelle obsolete.

## 9. Exigences transverses

- Auth: JWT Supabase sur toutes les routes metier.
- Multi-tenant: filtrer par tenant/org, jamais par `spaceId` seul si tenant dispo.
- CORS prod: remplacer `*` par domaines autorises.
- Pagination: obligatoire pour timeline, events lourds, inventory lists.
- ETag: utile pour dashboard, KPIs, timeline, summaries.
- Validation DTO: `class-validator` sur toutes les entrees.
- Tests e2e: Supertest pour happy path + 401 + tenant isolation + 404.

## Checklist livraison P0/P1

- [ ] Swagger public `/api/v1/docs` et `/api/v1/openapi.json`.
- [ ] `POST /inventory` ne retourne plus 404.
- [ ] `GET /inventory/:spaceId/:eventId` retourne le dernier snapshot.
- [ ] `GET /inventory/:spaceId/latest` retourne le dernier snapshot du space.
- [ ] `POST /inventory-counts` upsert un item count.
- [ ] `GET /packaging` confirme shape exploitable par front.
- [ ] Event Predict persiste serveur via `/kv/:key` ou routes dediees.
- [ ] `GET /analyse/timeline/:eventId` retourne des records reels, pagines.
- [ ] `openapi.json` backend documente tout.

## Tests manuels minimum

```bash
curl -i "$API/api/v1/packaging" \
  -H "Authorization: Bearer $TOKEN"

curl -i -X POST "$API/api/v1/inventory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spaceId":"'$SPACE_ID'","eventId":"'$EVENT_ID'","inventoryCounts":{}}'

curl -i "$API/api/v1/inventory/$SPACE_ID/$EVENT_ID" \
  -H "Authorization: Bearer $TOKEN"

curl -i -X POST "$API/api/v1/inventory-counts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spaceId":"'$SPACE_ID'","eventId":"'$EVENT_ID'","shopId":"'$SHOP_ID'","itemId":"'$ITEM_ID'","packedUnits":1,"looseUnits":2,"isCounted":true}'

curl -i "$API/api/v1/events/$EVENT_ID/predict-versions" \
  -H "Authorization: Bearer $TOKEN"

curl -i "$API/api/v1/analyse/timeline/$EVENT_ID?limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

## Definition of done

- Sauvegarde inventaire depuis front ne log plus `POST /inventory 404`.
- Reload page + navigateur different: inventaire retrouve depuis API.
- Version Event Predict sauvegardee visible depuis autre session.
- Timeline Analyse charge depuis API, pas depuis mock.
- Swagger public montre routes inventaire, predict versions, timeline.
- Tous les endpoints refusent un token absent/invalide.
