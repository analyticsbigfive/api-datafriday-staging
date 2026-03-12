# Events API (DataFriday) — Frontend Handoff (curl + payloads + réponses)

**Base URL (dev)**: `http://localhost:3000/api/v1`

Tous les endpoints ci-dessous nécessitent l’auth (**JWT Supabase**) :

- Header requis : `Authorization: Bearer <JWT>`
- Header recommandé : `Content-Type: application/json`

## Variables shell (copier/coller)

```bash
export API_BASE_URL="http://localhost:3000/api/v1"
export JWT="REPLACE_ME"

# Optionnel: pretty print JSON
alias jqp='python -m json.tool'
```

---

# 1) GET /events

## 1.1 Lister les events

**Route**: `GET /events`

**Query params**:
- `page` (string → cast number, default `1`)
- `limit` (string → cast number, default `50`)

**curl**:
```bash
curl -s "$API_BASE_URL/events?page=1&limit=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)** (voir `EventsService.findAll`):
```json
{
  "data": [
    {
      "id": "evt_df_...",
      "tenantId": "tenant_...",
      "name": "Match Ligue 1",
      "eventDate": "2026-03-01T20:00:00.000Z",
      "spaceId": "space_...",
      "configurationId": null,
      "eventTypeId": null,
      "eventCategoryId": null,
      "eventSubcategoryId": null,
      "location": "Stade ...",
      "spaceName": "Stade ...",
      "sessions": null,
      "numberOfSessions": null,
      "hasOpeningAct": false,
      "hasIntermission": true,
      "status": "draft",
      "createdAt": "...",
      "updatedAt": "...",

      "eventType": null,
      "eventCategory": null,
      "eventSubcategory": null
    }
  ],
  "meta": {
    "total": 123,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

---

## 1.2 Détail d’un event

**Route**: `GET /events/:id`

**Path params**:
- `id` (string)

**curl**:
```bash
export EVENT_ID="REPLACE_ME"

curl -s "$API_BASE_URL/events/$EVENT_ID" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)** (voir `EventsService.findOne`):
- objet `Event` avec relations :
  - `eventType`
  - `eventCategory`
  - `eventSubcategory`

---

# 2) GET /event-types

## 2.1 Lister les types d’events

**Route**: `GET /event-types`

**Query params**: aucun

**curl**:
```bash
curl -s "$API_BASE_URL/event-types" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)** (voir `EventsService.getEventTypes`):
```json
[
  {
    "id": "type_...",
    "tenantId": null,
    "name": "Sport",
    "categories": [
      {
        "id": "cat_...",
        "name": "Football",
        "eventTypeId": "type_...",
        "tenantId": null
      }
    ]
  }
]
```

---

# 3) GET /event-categories

## 3.1 Lister les catégories

**Route**: `GET /event-categories`

**Query params**: aucun

**curl**:
```bash
curl -s "$API_BASE_URL/event-categories" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)** (voir `EventsService.getEventCategories`):
```json
[
  {
    "id": "cat_...",
    "tenantId": null,
    "name": "Football",
    "eventTypeId": "type_...",
    "subcategories": [
      {
        "id": "subcat_...",
        "tenantId": null,
        "name": "Ligue 1",
        "eventCategoryId": "cat_..."
      }
    ]
  }
]
```

---

# 4) GET /event-subcategories

## 4.1 Lister les sous-catégories

**Route**: `GET /event-subcategories`

**Query params**: aucun

**curl**:
```bash
curl -s "$API_BASE_URL/event-subcategories" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)** (voir `EventsService.getEventSubcategories`):
```json
[
  {
    "id": "subcat_...",
    "tenantId": null,
    "name": "Ligue 1",
    "eventCategoryId": "cat_..."
  }
]
```

---

# Notes importantes pour les devs frontend

## Pagination
- `GET /events` utilise `page` + `limit`.

## Multi-tenant
- `tenantId` est dérivé du JWT côté backend.

---

**Source de vérité (backend)**:
- `src/features/events/events.controller.ts`
- `src/features/events/events.service.ts`

---

# 5) Suite de tests complète (curl)

## 5.1 Pré-requis

- Toutes les routes sont protégées par auth (JWT).
- Ces tests supposent que l’API tourne sur `localhost:3000`.

```bash
export API_BASE_URL="http://localhost:3000/api/v1"
export JWT="REPLACE_ME"
alias jqp='python -m json.tool'
```

---

## 5.2 Tests — Events (CRUD)

### 5.2.1 GET /events (liste)

```bash
curl -i "$API_BASE_URL/events?page=1&limit=50" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`
  - body: `{ data: Event[], meta: { total, page, limit, totalPages } }`

### 5.2.2 POST /events (création)

**Route**: `POST /events`

**Données à envoyer (min)**:
- `name` (string)
- `eventDate` (ISO date string)

```bash
curl -i -X POST "$API_BASE_URL/events" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Event test API",
    "eventDate": "2026-03-01T20:00:00.000Z"
  }'
```

- **Attendu**:
  - HTTP `201`
  - body: objet `Event` créé + relations (`eventType`, `eventCategory`, `eventSubcategory`)

**Optionnel (complet)**: champs possibles (voir `CreateEventDto`)
- `spaceId`, `configurationId`, `eventTypeId`, `eventCategoryId`, `eventSubcategoryId`
- `location`, `spaceName`, `sessions`, `numberOfSessions`, `hasOpeningAct`, `hasIntermission`, `status`

### 5.2.3 GET /events/:id (détail)

```bash
export EVENT_ID="REPLACE_ME"
curl -i "$API_BASE_URL/events/$EVENT_ID" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200` si trouvé
  - HTTP `404` si non trouvé (`Event <id> not found`)

### 5.2.4 PATCH /events/:id (update)

```bash
export EVENT_ID="REPLACE_ME"
curl -i -X PATCH "$API_BASE_URL/events/$EVENT_ID" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Event test API (updated)",
    "status": "published"
  }'
```

- **Attendu**:
  - HTTP `200`
  - body: objet `Event` mis à jour
  - HTTP `404` si l’event n’existe pas

### 5.2.5 DELETE /events/:id (suppression)

```bash
export EVENT_ID="REPLACE_ME"
curl -i -X DELETE "$API_BASE_URL/events/$EVENT_ID" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200` (Prisma delete retourne l’objet supprimé)
  - HTTP `404` si l’event n’existe pas

---

## 5.3 Tests — Event Types (CRUD)

### 5.3.1 GET /event-types

```bash
curl -i "$API_BASE_URL/event-types" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`
  - body: `EventType[]` avec `categories` inclus

### 5.3.2 POST /event-types

```bash
curl -i -X POST "$API_BASE_URL/event-types" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Type test API"
  }'
```

- **Attendu**:
  - HTTP `201`
  - body: objet `EventType`

### 5.3.3 PATCH /event-types/:id

```bash
export EVENT_TYPE_ID="REPLACE_ME"
curl -i -X PATCH "$API_BASE_URL/event-types/$EVENT_TYPE_ID" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Type test API (updated)"
  }'
```

- **Attendu**:
  - HTTP `200`
  - body: objet `EventType` mis à jour

### 5.3.4 DELETE /event-types/:id

```bash
export EVENT_TYPE_ID="REPLACE_ME"
curl -i -X DELETE "$API_BASE_URL/event-types/$EVENT_TYPE_ID" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`
  - body: objet supprimé

---

## 5.4 Tests — Event Categories (CRUD)

### 5.4.1 GET /event-categories

```bash
curl -i "$API_BASE_URL/event-categories" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`
  - body: `EventCategory[]` avec `subcategories` inclus

### 5.4.2 POST /event-categories

**Body requis**:
- `name` (string)
- `eventTypeId` (string)

```bash
export EVENT_TYPE_ID="REPLACE_ME"
curl -i -X POST "$API_BASE_URL/event-categories" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Cat test API\",\"eventTypeId\":\"$EVENT_TYPE_ID\"}"
```

- **Attendu**:
  - HTTP `201`
  - body: objet `EventCategory`

### 5.4.3 PATCH /event-categories/:id

```bash
export EVENT_CATEGORY_ID="REPLACE_ME"
curl -i -X PATCH "$API_BASE_URL/event-categories/$EVENT_CATEGORY_ID" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cat test API (updated)"
  }'
```

- **Attendu**:
  - HTTP `200`

### 5.4.4 DELETE /event-categories/:id

```bash
export EVENT_CATEGORY_ID="REPLACE_ME"
curl -i -X DELETE "$API_BASE_URL/event-categories/$EVENT_CATEGORY_ID" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`

---

## 5.5 Tests — Event Subcategories (CRUD)

### 5.5.1 GET /event-subcategories

```bash
curl -i "$API_BASE_URL/event-subcategories" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`

### 5.5.2 POST /event-subcategories

**Body requis**:
- `name` (string)
- `eventCategoryId` (string)

```bash
export EVENT_CATEGORY_ID="REPLACE_ME"
curl -i -X POST "$API_BASE_URL/event-subcategories" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Subcat test API\",\"eventCategoryId\":\"$EVENT_CATEGORY_ID\"}"
```

- **Attendu**:
  - HTTP `201`

### 5.5.3 PATCH /event-subcategories/:id

```bash
export EVENT_SUBCATEGORY_ID="REPLACE_ME"
curl -i -X PATCH "$API_BASE_URL/event-subcategories/$EVENT_SUBCATEGORY_ID" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Subcat test API (updated)"
  }'
```

- **Attendu**:
  - HTTP `200`

### 5.5.4 DELETE /event-subcategories/:id

```bash
export EVENT_SUBCATEGORY_ID="REPLACE_ME"
curl -i -X DELETE "$API_BASE_URL/event-subcategories/$EVENT_SUBCATEGORY_ID" \
  -H "Authorization: Bearer $JWT"
```

- **Attendu**:
  - HTTP `200`

---

## 5.6 Notes sur les erreurs (attendu)

- **Sans JWT**: HTTP `401`
- **ID non trouvé** (events): HTTP `404`
- **Validation body** (ex: champs requis manquants): HTTP `400`
