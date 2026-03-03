# Weezevent P0/P1 Implementation — Résumé complet

**Date**: 2026-03-03  
**Migration**: `20260303150412_add_weezevent_product_mapping_variants_components_orders_prices_attendees`

---

## ✅ Implémentation complète (P0 + P1)

### 1. **Nouvelles tables Prisma** (6 tables créées)

#### A) `WeezeventProductMapping`
**Objectif** : Lier produits Weezevent ↔ MenuItem DataFriday pour analytics ventes vs coûts.

**Champs** :
- `weezeventProductId` (unique) → lien vers `WeezeventProduct`
- `menuItemId` → lien vers `MenuItem`
- `autoMapped` : mapping automatique ou manuel
- `confidence` : score de confiance (si auto-mapping)
- `mappedBy` : userId qui a créé le mapping

**Endpoints** :
- `POST /api/v1/weezevent/products/:productId/map` : créer/modifier mapping
- `GET /api/v1/weezevent/products/mappings` : liste mappings
- `DELETE /api/v1/weezevent/products/:productId/map` : supprimer mapping

#### B) `WeezeventProductVariant`
**Objectif** : Stocker les variants de produits (tailles, options).

**Champs** :
- `productId` → lien vers `WeezeventProduct`
- `name`, `description`, `price`, `sku`, `stock`, `isDefault`

**Sync** : automatique via `syncProducts` (appelle `GET /products/{id}/variants`).

#### C) `WeezeventProductComponent`
**Objectif** : Stocker les composants/ingrédients de produits.

**Champs** :
- `productId` → lien vers `WeezeventProduct`
- `name`, `description`, `quantity`, `unit`, `isRequired`

**Sync** : automatique via `syncProducts` (appelle `GET /products/{id}/components`).

#### D) `WeezeventOrder`
**Objectif** : Stocker les commandes (paniers) distinctes des transactions (paiements).

**Champs** :
- `eventId`, `userId`, `userEmail`, `status`, `totalAmount`, `orderDate`, `paymentMethod`

**Endpoints** :
- `GET /api/v1/weezevent/orders` : liste orders
- `POST /api/v1/weezevent/sync` (type: 'orders') : sync orders

**Sync** : `syncOrders(tenantId, eventId)` → appelle `GET /events/{id}/orders`.

#### E) `WeezeventPrice`
**Objectif** : Stocker les grilles tarifaires.

**Champs** :
- `eventId`, `productId`, `name`, `amount`, `currency`, `validFrom`, `validUntil`, `priceType`

**Endpoints** :
- `GET /api/v1/weezevent/prices` : liste prices
- `POST /api/v1/weezevent/sync` (type: 'prices') : sync prices

**Sync** : `syncPrices(tenantId, eventId?)` → appelle `GET /prices` ou `GET /events/{id}/prices`.

#### F) `WeezeventAttendee`
**Objectif** : Stocker les participants (analytics panier moyen).

**Champs** :
- `eventId`, `email`, `firstName`, `lastName`, `ticketType`, `status`

**Endpoints** :
- `GET /api/v1/weezevent/attendees` : liste attendees
- `POST /api/v1/weezevent/sync` (type: 'attendees') : sync attendees

**Sync** : `syncAttendees(tenantId, eventId)` → appelle `GET /events/{id}/attendees`.

---

### 2. **Extensions API Client** (`weezevent-client.service.ts`)

Ajout de 8 nouvelles méthodes :

#### Products avancés
- `getProductVariants(tenantId, orgId, productId, eventId?)` → variants
- `getProductComponents(tenantId, orgId, productId, eventId?)` → components
- `getProductMenuSteps(tenantId, orgId, productId, eventId?)` → menu-steps (stocké dans rawData)

#### Orders
- `getOrders(tenantId, orgId, eventId, options?)` → liste orders
- `getOrder(tenantId, orgId, eventId, orderId)` → détail order

#### Prices
- `getPrices(tenantId, orgId, eventId?, options?)` → liste prices

#### Attendees
- `getAttendees(tenantId, orgId, eventId, options?)` → liste attendees

---

### 3. **Services de sync étendus** (`weezevent-sync.service.ts`)

#### A) `syncProducts` étendu
**Avant** : récupérait uniquement liste produits.

**Maintenant** :
1. Sync liste produits (comme avant)
2. **Pour chaque produit** : appelle `syncProductDetails()`
   - Récupère variants → stocke dans `WeezeventProductVariant`
   - Récupère components → stocke dans `WeezeventProductComponent`
   - Menu-steps stockés dans `rawData` (structure complexe)

**Optimisation** : batch operations, skip si erreur sur un produit (log warning).

#### B) Nouveaux services de sync
- `syncOrders(tenantId, eventId)` : sync commandes d'un événement
- `syncPrices(tenantId, eventId?)` : sync grilles tarifaires
- `syncAttendees(tenantId, eventId)` : sync participants

**Tous** : pagination automatique, upsert (create/update), tracking erreurs.

---

### 4. **Endpoints controller** (`weezevent.controller.ts`)

#### A) Sync étendu
`POST /api/v1/weezevent/sync` supporte maintenant :
- `type: 'orders'` (requiert `eventId`)
- `type: 'prices'` (optionnel `eventId`)
- `type: 'attendees'` (requiert `eventId`)

**DTO mis à jour** : `SyncWeezeventDto` accepte `eventId: string` (au lieu de `number`).

#### B) Mapping produits
- `POST /api/v1/weezevent/products/:productId/map`
  - Body: `{ menuItemId, autoMapped?, confidence? }`
  - Crée/update mapping produit Weezevent ↔ MenuItem
  
- `GET /api/v1/weezevent/products/mappings`
  - Liste tous les mappings avec relations (product + menuItem)
  
- `DELETE /api/v1/weezevent/products/:productId/map`
  - Supprime mapping

#### C) Lecture données
- `GET /api/v1/weezevent/orders` (filtres: `eventId`, pagination)
- `GET /api/v1/weezevent/prices` (filtres: `eventId`, pagination)
- `GET /api/v1/weezevent/attendees` (filtres: `eventId`, pagination)

---

### 5. **Webhook handlers** (`webhook-event.handler.ts`)

Ajout de 2 nouveaux handlers :

#### A) `handleOrderEvent`
**Événements** : `order.created`, `order.update`

**Action** : trigger sync immédiate des orders de l'événement concerné.

**Payload attendu** :
```json
{
  "type": "order",
  "method": "create",
  "data": {
    "id": "123",
    "event_id": "456"
  }
}
```

#### B) `handleProductEvent`
**Événements** : `product.updated`

**Action** : trigger full sync products (récupère variants/components mis à jour).

**Payload attendu** :
```json
{
  "type": "product",
  "method": "update",
  "data": {
    "id": "789"
  }
}
```

**Note** : webhooks déjà sécurisés (validation signature HMAC, stockage événement, traitement async).

---

### 6. **Analytics Weezevent** (`weezevent-analytics.controller.ts`)

Nouveau controller dédié : `GET /api/v1/weezevent/analytics/*`

#### A) `GET /analytics/sales-by-product`
**Filtres** : `eventId`, `fromDate`, `toDate`

**Retour** :
```json
{
  "data": [
    {
      "productId": "123",
      "productName": "Burger",
      "quantity": 150,
      "totalAmount": 1500.00,
      "transactionCount": 75
    }
  ],
  "meta": { "total": 10, "fromDate": "...", "toDate": "..." }
}
```

**Utilité** : top produits par CA.

#### B) `GET /analytics/sales-by-event`
**Filtres** : `fromDate`, `toDate`

**Retour** :
```json
{
  "data": [
    {
      "eventId": "456",
      "eventName": "Festival 2026",
      "totalAmount": 25000.00,
      "transactionCount": 500,
      "itemCount": 1200
    }
  ]
}
```

**Utilité** : CA par événement.

#### C) `GET /analytics/margin-analysis` ⭐ **LE PLUS IMPORTANT**
**Filtres** : `eventId`, `fromDate`, `toDate`

**Retour** :
```json
{
  "summary": {
    "totalSales": 10000.00,
    "totalCost": 3500.00,
    "totalMargin": 6500.00,
    "marginPercent": 65.00,
    "mappedItems": 120,
    "unmappedItems": 30,
    "mappingRate": 80
  },
  "productMargins": [
    {
      "productId": "123",
      "productName": "Burger",
      "menuItemId": "abc",
      "menuItemName": "Burger Classic",
      "quantity": 50,
      "sales": 500.00,
      "cost": 150.00,
      "margin": 350.00,
      "marginPercent": 70.00
    }
  ]
}
```

**Utilité** : **croiser ventes Weezevent vs coûts DataFriday** (nécessite mapping produits).

**Indicateur clé** : `mappingRate` → % produits mappés (si < 100%, certains produits ne sont pas liés à des MenuItem).

#### D) `GET /analytics/top-products`
**Filtres** : `limit`, `eventId`, `fromDate`, `toDate`

**Retour** : top N produits par revenue + stats (quantity, averagePrice, category).

---

## 📊 Architecture complète

### Flux de données

```
Weezevent API
    ↓ (sync CRON ou manuelle)
Tables Weezevent (events, products, transactions, orders, prices, attendees)
    ↓ (mapping manuel ou auto)
WeezeventProductMapping
    ↓ (lien vers)
MenuItem (avec totalCost calculé)
    ↓ (analytics)
Endpoints /analytics/* (ventes vs coûts)
```

### Sync automatique (CRON)

**Existant** :
- Toutes les 10 min : transactions (incrémental)
- Quotidien 3h : events + products
- Hebdo dimanche 2h : full sync

**Nouveau** : `syncProducts` récupère maintenant **variants + components** automatiquement.

**À ajouter** (optionnel) :
- CRON pour orders/prices/attendees (si besoin temps réel)
- Ou utiliser webhooks (`order.created` → sync immédiate)

---

## 🎯 Utilisation frontend

### 1) Mapper produits Weezevent → MenuItem

**UI suggérée** : page "Mapping Produits Weezevent"

```javascript
// Liste produits Weezevent non mappés
GET /api/v1/weezevent/products?page=1&perPage=50

// Liste MenuItem disponibles
GET /api/v1/menu-items?page=1&perPage=50

// Créer mapping
POST /api/v1/weezevent/products/{productId}/map
Body: { menuItemId: "abc123" }

// Voir mappings existants
GET /api/v1/weezevent/products/mappings
```

**Auto-mapping** (futur) : algorithme de matching par nom/catégorie (set `autoMapped: true`, `confidence: 0.85`).

### 2) Analytics ventes vs coûts

**Dashboard suggéré** : "Analytics Weezevent"

```javascript
// Résumé global
GET /api/v1/weezevent/analytics/margin-analysis?fromDate=2026-01-01&toDate=2026-12-31

// Top produits
GET /api/v1/weezevent/analytics/top-products?limit=10

// CA par événement
GET /api/v1/weezevent/analytics/sales-by-event

// Détail par produit
GET /api/v1/weezevent/analytics/sales-by-product?eventId=456
```

**Indicateurs clés** :
- Mapping rate (% produits mappés)
- Marge globale (ventes - coûts)
- Top produits rentables
- Événements les plus profitables

### 3) Sync manuelle

**UI suggérée** : boutons "Sync" dans admin

```javascript
// Sync products (avec variants/components)
POST /api/v1/weezevent/sync
Body: { type: "products" }

// Sync orders d'un événement
POST /api/v1/weezevent/sync
Body: { type: "orders", eventId: "456" }

// Sync prices
POST /api/v1/weezevent/sync
Body: { type: "prices" }

// Voir statut sync
GET /api/v1/weezevent/sync/status
```

---

## 🔧 Configuration requise

### 1) Webhooks Weezevent

**Créer webhook** (via UI Weezevent ou API) :
- URL : `https://api.datafriday.com/api/v1/webhooks/weezevent/{tenantId}`
- Events : `order.created`, `order.updated`, `transaction.completed`, `product.updated`
- Secret : stocker dans `Tenant.weezeventWebhookSecret`

**Activation** :
```sql
UPDATE "Tenant" 
SET "weezeventWebhookEnabled" = true, 
    "weezeventWebhookSecret" = 'secret_from_weezevent'
WHERE id = 'tenant_id';
```

### 2) Mapping initial

**Après première sync products** :
1. Lister produits Weezevent : `GET /weezevent/products`
2. Lister MenuItem : `GET /menu-items`
3. Créer mappings manuels ou auto (algorithme à implémenter)

**Indicateur santé** : `GET /weezevent/analytics/margin-analysis` → vérifier `mappingRate` proche de 100%.

---

## 📝 Migration appliquée

**Fichier** : `prisma/migrations/20260303150412_add_weezevent_product_mapping_variants_components_orders_prices_attendees/migration.sql`

**Tables créées** :
- `WeezeventProductMapping`
- `WeezeventProductVariant`
- `WeezeventProductComponent`
- `WeezeventOrder`
- `WeezeventPrice`
- `WeezeventAttendee`

**Relations ajoutées** :
- `Tenant` → 6 nouvelles relations
- `WeezeventProduct` → `mappings`, `productVariants`, `productComponents`, `prices`
- `WeezeventEvent` → `orders`, `prices`, `attendees`
- `MenuItem` → `weezeventMappings`

**Indexes créés** :
- Tous les `weezeventId` (unique)
- `tenantId`, `eventId`, `productId`, `menuItemId`
- Dates (`orderDate`, `transactionDate`)
- `autoMapped` (pour filtrer mappings auto vs manuels)

---

## ✅ Checklist production

### Backend
- [x] Tables Prisma créées
- [x] Migration appliquée
- [x] Client Prisma régénéré
- [x] API client étendu (variants/components/orders/prices/attendees)
- [x] Services sync implémentés
- [x] Endpoints controller ajoutés
- [x] Webhook handlers étendus
- [x] Analytics endpoints créés
- [x] Module Weezevent mis à jour

### À faire (frontend)
- [ ] UI mapping produits Weezevent ↔ MenuItem
- [ ] Dashboard analytics Weezevent (ventes vs coûts)
- [ ] Boutons sync manuels (admin)
- [ ] Indicateur mapping rate (santé)

### À faire (backend optionnel)
- [ ] Auto-mapping algorithme (matching par nom/catégorie)
- [ ] CRON pour orders/prices/attendees (si besoin temps réel)
- [ ] Endpoint `GET /weezevent/unmapped-products` (produits sans mapping)
- [ ] Endpoint `POST /weezevent/auto-map` (trigger auto-mapping)

---

## 🚀 Prochaines étapes recommandées

### Sprint immédiat (frontend)
1. **Page mapping produits** : UI pour lier produits Weezevent → MenuItem
2. **Dashboard analytics** : afficher margin-analysis + top-products
3. **Indicateur santé** : badge "X% produits mappés" (alerte si < 80%)

### Sprint suivant (backend optionnel)
4. **Auto-mapping** : algorithme de matching automatique (nom, catégorie, similarité)
5. **Webhooks temps réel** : configurer webhooks Weezevent pour sync immédiate
6. **Export analytics** : CSV/Excel des marges par produit/événement

---

## 📌 Résumé exécutif

**Implémenté** :
- ✅ 6 nouvelles tables Prisma (mapping, variants, components, orders, prices, attendees)
- ✅ Sync complet produits (avec variants/components)
- ✅ Sync orders, prices, attendees
- ✅ Endpoints mapping produits
- ✅ Webhook handlers (order, product)
- ✅ 4 endpoints analytics (sales-by-product, sales-by-event, margin-analysis, top-products)
- ✅ Migration DB appliquée

**Résultat** :
- Backend **100% prêt** pour analytics ventes vs coûts
- **Manque uniquement** : UI frontend pour mapping produits + dashboard analytics

**Temps estimé frontend** : 2-3 jours (mapping UI + dashboard analytics).

**Bénéfice** : croiser ventes Weezevent (CA réel) vs coûts DataFriday (compositions) → **marges réelles par produit/événement**.
