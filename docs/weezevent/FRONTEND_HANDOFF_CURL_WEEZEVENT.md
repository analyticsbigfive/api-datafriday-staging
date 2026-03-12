# Weezevent API — Frontend Handoff (curl + payloads + réponses)

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

# 1) GET Weezevent — Events

## 1.1 Lister les events

**Route**: `GET /weezevent/events`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/events?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "evt_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "name": "Festival 2026",
      "startDate": "2026-03-01T00:00:00.000Z",
      "endDate": "2026-03-02T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "...",
      "syncedAt": "..."
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 123,
    "total_pages": 3
  }
}
```

---

# 2) GET Weezevent — Products

## 2.1 Lister les products

**Route**: `GET /weezevent/products`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)
- `category` (string, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/products?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**curl (avec filtre category)**:
```bash
curl -s "$API_BASE_URL/weezevent/products?page=1&perPage=50&category=food" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "prod_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "name": "Burger",
      "category": "food",
      "rawData": {},
      "createdAt": "...",
      "updatedAt": "...",
      "syncedAt": "..."
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 250,
    "total_pages": 5
  }
}
```

---

# 3) GET Weezevent — Transactions

## 3.1 Lister les transactions

**Route**: `GET /weezevent/transactions`

**Query params (DTO: GetTransactionsQueryDto)**:
- `page` (int, default `1`)
- `perPage` (int, default `50`, max `100`)
- `status` (enum: `W | V | C | R`, optional)
- `fromDate` (ISO date string, optional)
- `toDate` (ISO date string, optional)
- `eventId` (string, optional)
- `merchantId` (string, optional)

**curl (simple)**:
```bash
curl -s "$API_BASE_URL/weezevent/transactions?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**curl (filtrage)**:
```bash
curl -s "$API_BASE_URL/weezevent/transactions?page=1&perPage=50&status=V&fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "tx_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "status": "V",
      "amount": "123.45",
      "transactionDate": "2026-03-01T12:00:00.000Z",
      "eventId": "evt_...",
      "merchantId": "merch_...",
      "items": [
        {
          "id": "item_...",
          "productId": "prod_...",
          "productName": "Burger",
          "quantity": 2,
          "unitPrice": "12.00",
          "payments": []
        }
      ]
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 1000,
    "total_pages": 20
  }
}
```

## 3.2 Détail d’une transaction

**Route**: `GET /weezevent/transactions/:id`

**curl**:
```bash
export TX_ID="REPLACE_ME"
curl -s "$API_BASE_URL/weezevent/transactions/$TX_ID" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
- transaction + `items.payments` + `event` + `merchant` + `location`

---

# 4) GET Weezevent — Orders

## 4.1 Lister les orders

**Route**: `GET /weezevent/orders`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)
- `eventId` (string, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/orders?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**curl (par event)**:
```bash
export EVENT_ID="REPLACE_ME"
curl -s "$API_BASE_URL/weezevent/orders?page=1&perPage=50&eventId=$EVENT_ID" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "order_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "eventId": "evt_...",
      "userId": "user_...",
      "userEmail": "client@example.com",
      "status": "paid",
      "totalAmount": "45.00",
      "orderDate": "2026-03-01T12:00:00.000Z",
      "paymentMethod": "card",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 100,
    "total_pages": 2
  }
}
```

---

# 5) GET Weezevent — Prices

## 5.1 Lister les prices

**Route**: `GET /weezevent/prices`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)
- `eventId` (string, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/prices?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "price_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "eventId": "evt_...",
      "productId": "prod_...",
      "name": "Prix standard",
      "amount": "12.00",
      "currency": "EUR",
      "validFrom": "2026-01-01T00:00:00.000Z",
      "validUntil": null,
      "priceType": "standard",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 80,
    "total_pages": 2
  }
}
```

---

# 6) GET Weezevent — Attendees

## 6.1 Lister les attendees

**Route**: `GET /weezevent/attendees`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)
- `eventId` (string, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/attendees?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "att_...",
      "tenantId": "tenant_...",
      "weezeventId": "...",
      "eventId": "evt_...",
      "email": "client@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "ticketType": "VIP",
      "status": "valid",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 500,
    "total_pages": 10
  }
}
```

---

# 7) GET Weezevent — Product Mappings

## 7.1 Lister les mappings produit ↔ menuItem

**Route**: `GET /weezevent/products/mappings`

**Query params**:
- `page` (number, default `1`)
- `perPage` (number, default `50`)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/products/mappings?page=1&perPage=50" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "id": "map_...",
      "tenantId": "tenant_...",
      "weezeventProductId": "prod_...",
      "menuItemId": "menu_...",
      "autoMapped": false,
      "confidence": null,
      "mappedBy": "user_...",
      "createdAt": "...",
      "weezeventProduct": { "id": "prod_...", "name": "Burger", "category": "food" },
      "menuItem": { "id": "menu_...", "name": "Burger Classic", "totalCost": "4.20" }
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 10,
    "total_pages": 1
  }
}
```

---

# 8) GET Weezevent — Sync status

## 8.1 Statut de sync

**Route**: `GET /weezevent/sync/status`

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/sync/status" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "events": { "count": 0 },
  "transactions": { "count": 0 },
  "products": { "count": 0 },
  "runningSyncs": [],
  "isRunning": false
}
```

---

# 9) GET Weezevent Analytics

Base: `GET /weezevent/analytics/*`

## 9.1 Sales by product

**Route**: `GET /weezevent/analytics/sales-by-product`

**Query params**:
- `eventId` (string, optional)
- `fromDate` (string ISO date, optional)
- `toDate` (string ISO date, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/analytics/sales-by-product?fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "productId": "prod_...",
      "productName": "Burger",
      "quantity": 150,
      "totalAmount": 1500,
      "transactionCount": 75
    }
  ],
  "meta": {
    "total": 10,
    "fromDate": "2026-01-01",
    "toDate": "2026-12-31",
    "eventId": null
  }
}
```

## 9.2 Sales by event

**Route**: `GET /weezevent/analytics/sales-by-event`

**Query params**:
- `fromDate` (string ISO date, optional)
- `toDate` (string ISO date, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/analytics/sales-by-event?fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "eventId": "evt_...",
      "eventName": "Festival 2026",
      "totalAmount": 25000,
      "transactionCount": 500,
      "itemCount": 1200
    }
  ],
  "meta": {
    "total": 3,
    "fromDate": "2026-01-01",
    "toDate": "2026-12-31"
  }
}
```

## 9.3 Margin analysis (sales vs costs)

**Route**: `GET /weezevent/analytics/margin-analysis`

**Query params**:
- `eventId` (string, optional)
- `fromDate` (string ISO date, optional)
- `toDate` (string ISO date, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/analytics/margin-analysis?fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "summary": {
    "totalSales": 10000,
    "totalCost": 3500,
    "totalMargin": 6500,
    "marginPercent": 65,
    "mappedItems": 120,
    "unmappedItems": 30,
    "mappingRate": 80
  },
  "productMargins": [
    {
      "productId": "prod_...",
      "productName": "Burger",
      "menuItemId": "menu_...",
      "menuItemName": "Burger Classic",
      "quantity": 50,
      "sales": 500,
      "cost": 150,
      "margin": 350,
      "marginPercent": 70
    }
  ],
  "meta": {
    "fromDate": "2026-01-01",
    "toDate": "2026-12-31",
    "eventId": null
  }
}
```

## 9.4 Top products (par revenue)

**Route**: `GET /weezevent/analytics/top-products`

**Query params**:
- `limit` (number, default `10`)
- `eventId` (string, optional)
- `fromDate` (string ISO date, optional)
- `toDate` (string ISO date, optional)

**curl**:
```bash
curl -s "$API_BASE_URL/weezevent/analytics/top-products?limit=10&fromDate=2026-01-01&toDate=2026-12-31" \
  -H "Authorization: Bearer $JWT" | jqp
```

**Réponse (shape)**:
```json
{
  "data": [
    {
      "productId": "prod_...",
      "productName": "Burger",
      "category": "food",
      "quantity": 150,
      "revenue": 1500,
      "averagePrice": 10
    }
  ],
  "meta": {
    "total": 42,
    "limit": 10,
    "fromDate": "2026-01-01",
    "toDate": "2026-12-31",
    "eventId": null
  }
}
```

---

# Notes importantes pour les devs frontend

## Auth
- Toutes les routes sont protégées par `JwtDatabaseGuard`.
- Le frontend doit envoyer le JWT Supabase en `Authorization: Bearer <token>`.

## Pagination
- La plupart des listes Weezevent utilisent :
  - `page` (1..n)
  - `perPage` (par défaut 50)
- Transactions : `perPage` max = 100 (DTO).

## Dates
- `fromDate` / `toDate` acceptent des strings ISO (ex: `2026-01-01` ou `2026-01-01T00:00:00.000Z`).

---

**Source de vérité (backend)**:
- `src/features/weezevent/weezevent.controller.ts`
- `src/features/weezevent/weezevent-analytics.controller.ts`
- `src/features/weezevent/dto/get-transactions-query.dto.ts`
