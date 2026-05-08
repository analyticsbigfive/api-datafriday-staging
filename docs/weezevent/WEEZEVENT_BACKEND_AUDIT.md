# Audit Backend Weezevent — État actuel vs Besoins

**Date**: 2026-03-03  
**Objectif**: Identifier ce qui est déjà implémenté dans le backend Weezevent vs ce qui manque pour être 100% production-ready.

---

## ✅ CE QUI EXISTE DÉJÀ (Implémenté)

### 1) **Architecture modulaire complète**
- ✅ Module Weezevent (`src/features/weezevent/`)
- ✅ Services séparés par responsabilité :
  - `WeezeventAuthService` : authentification OAuth
  - `WeezeventApiService` : appels API bas niveau
  - `WeezeventClientService` : client API haut niveau
  - `WeezeventSyncService` : sync classique (transactions/products)
  - `WeezeventIncrementalSyncService` : sync incrémentale optimisée
  - `WeezeventCronService` : jobs planifiés
  - `SyncTrackerService` : tracking des syncs en cours
  - `WebhookSignatureService` : validation signatures webhooks
  - `WebhookEventHandler` : traitement événements webhooks

### 2) **Tables Prisma (stockage données Weezevent)**
✅ **Toutes les tables P0 existent** :
- `WeezeventEvent` : événements
- `WeezeventProduct` : produits (F&B)
- `WeezeventTransaction` : commandes/ventes
- `WeezeventTransactionItem` : lignes de commande
- `WeezeventPayment` : paiements
- `WeezeventMerchant` : marchands
- `WeezeventLocation` : lieux
- `WeezeventUser` : utilisateurs
- `WeezeventWallet` : portefeuilles cashless
- `WeezeventSyncState` : état sync incrémentale (checkpoint)
- `WeezeventWebhookEvent` : événements webhooks reçus

**Tous les champs nécessaires sont présents** :
- `weezeventId` (unique) : lien vers ID Weezevent
- `tenantId` : multi-tenant
- `syncedAt` : date dernière sync
- `rawData` : JSON brut API (backup)
- Relations : `event`, `merchant`, `location`, `items`, `payments`

### 3) **Endpoints API backend**
✅ **Routes lecture (GET)** :
- `GET /api/v1/weezevent/transactions` : liste transactions
- `GET /api/v1/weezevent/transactions/:id` : détail transaction
- `GET /api/v1/weezevent/events` : liste événements
- `GET /api/v1/weezevent/products` : liste produits

✅ **Routes sync manuelle (POST)** :
- `POST /api/v1/weezevent/sync` : sync manuelle (transactions/events/products)
  - Supporte `type: 'transactions' | 'events' | 'products'`
  - Supporte `full: true` (force full sync)
  - Supporte `fromDate/toDate` (filtres dates)

✅ **Routes monitoring** :
- `GET /api/v1/weezevent/sync/status` : état sync (counts, incremental state, running syncs)
- `DELETE /api/v1/weezevent/sync/state` : reset état sync (force full next time)

✅ **Webhooks** :
- `POST /api/v1/webhooks/weezevent/:tenantId` : receiver webhooks
  - Validation signature HMAC
  - Stockage événement webhook
  - Traitement async (non-blocking)

### 4) **CRON Jobs automatiques**
✅ **Sync incrémentale optimisée** :
- **Toutes les 10 minutes** : sync transactions (nouveautés seulement)
- **Quotidien (3h)** : sync events + products
- **Hebdomadaire (dimanche 2h)** : full sync (30 derniers jours)

✅ **Optimisations mémoire** :
- Batch size configurable (500 par défaut)
- Max items par run (10k transactions, 50k events)
- Pagination intelligente
- Tracking `lastUpdatedAt` pour sync incrémentale
- Skip items déjà à jour (évite updates inutiles)

### 5) **Appels API Weezevent implémentés**
✅ **Events** :
- `GET /organizations/{id}/events` (paginated)
- `GET /organizations/{id}/events/{eventId}`

✅ **Products** :
- `GET /organizations/{id}/products/{productId}`

✅ **Transactions** :
- `GET /organizations/{id}/events/{eventId}/transactions` (paginated)
- Filtres : `fromDate`, `toDate`, `eventId`, `merchantId`

✅ **Wallets/Users** :
- `GET /organizations/{id}/wallets`
- `GET /organizations/{id}/users`

### 6) **Sécurité & Auth**
✅ **OAuth Weezevent** :
- Stockage credentials : `weezeventClientId`, `weezeventClientSecret`
- Gestion tokens : `weezeventAccessToken`, `weezeventRefreshToken`
- Refresh automatique tokens expirés

✅ **Webhooks sécurisés** :
- Validation signature HMAC (`x-weezevent-signature`)
- Secret stocké par tenant : `weezeventWebhookSecret`
- Flag activation : `weezeventWebhookEnabled`

✅ **Guards NestJS** :
- `@UseGuards(JwtDatabaseGuard)` sur tous les endpoints Weezevent
- Tenant isolation (toutes les queries filtrent par `tenantId`)

---

## ❌ CE QUI MANQUE (Gaps identifiés)

### 1) **Appels API Weezevent manquants (P0)**

#### A) Products — routes avancées
❌ **Variants** (tailles/options) :
- `GET /organizations/{id}/products/{productId}/variants`
- `GET /organizations/{id}/events/{eventId}/products/{productId}/variants`

❌ **Components** (ingrédients/sous-produits) :
- `GET /organizations/{id}/products/{productId}/components`
- `GET /organizations/{id}/events/{eventId}/products/{productId}/components`

❌ **Menu steps** (choix personnalisables) :
- `GET /organizations/{id}/products/{productId}/menu-steps`
- `GET /organizations/{id}/events/{eventId}/products/{productId}/menu-steps`

**Impact** : on ne peut pas récupérer la **structure complète** des produits (variants + composants). Critique pour mapper vers nos `MenuItem` + `MenuComponent`.

#### B) Orders (commandes détaillées)
❌ **Orders endpoint** :
- `GET /organizations/{id}/events/{eventId}/orders`
- `GET /organizations/{id}/events/{eventId}/orders/{orderId}`

**Impact** : actuellement on sync les **transactions**, mais pas les **orders** (qui contiennent plus de détails sur les produits vendus). Les transactions sont plus "paiements", les orders sont "paniers".

**Note** : peut-être que transactions = orders dans l'API Weezevent ? À vérifier dans la doc.

#### C) Prices (grilles tarifaires)
❌ **Prices endpoint** :
- `GET /organizations/{id}/prices`
- `GET /organizations/{id}/events/{eventId}/prices`

**Impact** : on ne récupère pas les prix de vente (utile pour calcul marges auto).

#### D) Attendees (participants)
❌ **Attendees endpoint** :
- `GET /organizations/{id}/events/{eventId}/attendees`

**Impact** : analytics panier moyen, croiser participants vs ventes F&B.

### 2) **Sync logic manquante**

#### A) Sync products avec variants/components
❌ Le service `syncProducts` actuel récupère juste la liste produits, **sans** :
- variants
- components
- menu-steps

**Action requise** : étendre `syncProducts` pour appeler les sous-routes et stocker dans des tables dédiées (ou dans `rawData` JSON temporairement).

#### B) Sync orders (si différent de transactions)
❌ Pas de `syncOrders` actuellement.

**Action requise** : clarifier si `transactions` = `orders` dans Weezevent, sinon ajouter sync orders.

#### C) Sync prices
❌ Pas de sync prices.

**Action requise** : ajouter `syncPrices` (P1, pas urgent).

#### D) Sync attendees
❌ Pas de sync attendees.

**Action requise** : ajouter `syncAttendees` (P1, pas urgent).

### 3) **Tables Prisma manquantes**

#### A) Product variants/components
❌ Pas de tables dédiées pour :
- `WeezeventProductVariant`
- `WeezeventProductComponent`
- `WeezeventProductMenuStep`

**Impact** : on ne peut pas stocker la structure complète des produits.

**Solutions** :
- **Option 1** (rapide) : stocker dans `WeezeventProduct.rawData` (JSON)
- **Option 2** (propre) : créer tables dédiées avec relations

#### B) Orders (si différent de transactions)
❌ Pas de table `WeezeventOrder` (si orders ≠ transactions).

**Action requise** : clarifier besoin, puis créer table si nécessaire.

#### C) Prices
❌ Pas de table `WeezeventPrice`.

**Action requise** : créer table (P1).

#### D) Attendees
❌ Pas de table `WeezeventAttendee`.

**Action requise** : créer table (P1).

### 4) **Mapping produits Weezevent ↔ MenuItem**

❌ **Aucune table de mapping** actuellement.

**Problème** : on stocke les produits Weezevent, mais on ne les lie pas à nos `MenuItem`.

**Action requise** : créer table `WeezeventProductMapping` :
```prisma
model WeezeventProductMapping {
  id                String @id @default(cuid())
  tenantId          String
  weezeventProductId String
  menuItemId        String
  autoMapped        Boolean @default(false) // true si mapping auto, false si manuel
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  weezeventProduct  WeezeventProduct @relation(fields: [weezeventProductId], references: [id])
  menuItem          MenuItem @relation(fields: [menuItemId], references: [id])

  @@unique([weezeventProductId])
  @@index([menuItemId])
  @@index([tenantId])
}
```

### 5) **Webhooks : events supportés**

✅ Infrastructure webhook existe (receiver + validation).

❌ **Traitement événements spécifiques manquant** :
- `order.created` : nouvelle commande → sync immédiate
- `order.updated` : commande modifiée → update
- `transaction.completed` : paiement confirmé → update
- `product.updated` : produit modifié → resync
- `event.updated` : événement modifié → resync

**État actuel** : le `WebhookEventHandler` stocke l'événement mais ne fait pas de traitement métier spécifique.

**Action requise** : implémenter handlers par type d'événement dans `WebhookEventHandler`.

### 6) **Analytics exploitant données Weezevent**

❌ **Aucun endpoint analytics** actuellement.

**Endpoints manquants** :
- `GET /api/v1/analyse/weezevent/sales-by-product` : CA par produit
- `GET /api/v1/analyse/weezevent/sales-by-event` : CA par événement
- `GET /api/v1/analyse/weezevent/margin-analysis` : ventes - coûts
- `GET /api/v1/analyse/weezevent/top-products` : top ventes

**Action requise** : créer module analytics Weezevent (ou étendre module `analyse` existant).

### 7) **Configuration Weezevent par tenant**

✅ Champs config existent dans `Tenant` :
- `weezeventEnabled`
- `weezeventOrganizationId`
- `weezeventClientId`
- `weezeventClientSecret`
- `weezeventAccessToken`
- `weezeventRefreshToken`
- `weezeventWebhookEnabled`
- `weezeventWebhookSecret`

❌ **Pas d'endpoint dédié** pour gérer config (actuellement via `organizations/integrations/weezevent` ?).

**Action requise** : vérifier si `GET/PATCH /organizations/{id}/integrations/weezevent` existe et fonctionne.

---

## 📊 Résumé : Priorisation des gaps

### 🔴 **P0 - CRITIQUE** (bloquer pour production)

1. **Sync products avec variants/components** :
   - Ajouter appels API `GET /products/{id}/variants|components|menu-steps`
   - Stocker dans `rawData` ou tables dédiées
   - **Effort** : 1-2 jours

2. **Table mapping produits** :
   - Créer `WeezeventProductMapping`
   - Endpoint `POST /weezevent/products/{id}/map-to-menu-item`
   - **Effort** : 1 jour

3. **Webhook handlers métier** :
   - Implémenter traitement `order.created`, `transaction.completed`, `product.updated`
   - **Effort** : 1 jour

### 🟡 **P1 - IMPORTANT** (pour analytics complètes)

4. **Sync orders** (si ≠ transactions) :
   - Clarifier orders vs transactions
   - Ajouter sync si nécessaire
   - **Effort** : 1-2 jours

5. **Sync prices** :
   - Ajouter appel API + table `WeezeventPrice`
   - **Effort** : 1 jour

6. **Analytics Weezevent** :
   - Endpoints sales-by-product, margin-analysis
   - **Effort** : 2-3 jours

### 🟢 **P2 - NICE TO HAVE** (phase 3)

7. **Sync attendees** :
   - Table + sync
   - **Effort** : 1 jour

8. **Refunds** :
   - Table + sync
   - **Effort** : 1 jour

9. **Devices** :
   - Table + sync (analytics par terminal)
   - **Effort** : 1 jour

---

## 🎯 Plan d'action recommandé (ordre d'implémentation)

### Sprint 1 (P0 - 3-4 jours)
1. ✅ Ajouter appels API products variants/components/menu-steps
2. ✅ Étendre `syncProducts` pour récupérer structure complète
3. ✅ Créer table `WeezeventProductMapping`
4. ✅ Endpoint mapping manuel produits
5. ✅ Implémenter webhook handlers métier

### Sprint 2 (P1 - 3-4 jours)
6. ✅ Clarifier orders vs transactions (doc Weezevent)
7. ✅ Sync orders si nécessaire
8. ✅ Sync prices
9. ✅ Endpoints analytics Weezevent (sales, margins)

### Sprint 3 (P2 - optionnel)
10. ✅ Sync attendees
11. ✅ Sync refunds
12. ✅ Sync devices

---

## 🔍 Points à clarifier avec la doc Weezevent

1. **Orders vs Transactions** :
   - Est-ce que `transactions` = `orders` ?
   - Ou transactions = paiements et orders = paniers ?

2. **Product variants/components** :
   - Format exact de la réponse API
   - Relations entre product → variant → component

3. **Webhook events disponibles** :
   - Liste exhaustive des events supportés
   - Payload exact de chaque event

4. **Rate limits** :
   - Limites API (req/min, req/day)
   - Stratégie retry/backoff recommandée

---

## ✅ Conclusion

### Ce qui fonctionne déjà (80% du travail)
- ✅ Architecture modulaire solide
- ✅ Sync incrémentale optimisée (transactions/events/products)
- ✅ CRON automatique
- ✅ Webhooks sécurisés (infra)
- ✅ Tables Prisma complètes (events/transactions/products/wallets)
- ✅ Multi-tenant + auth

### Ce qui manque (20% restant)
- ❌ Sync structure complète produits (variants/components)
- ❌ Mapping produits Weezevent ↔ MenuItem
- ❌ Webhook handlers métier (order.created, etc.)
- ❌ Analytics Weezevent (sales, margins)

### Estimation effort total
- **P0** : 3-4 jours dev
- **P1** : 3-4 jours dev
- **Total MVP complet** : ~1 semaine

### Risque principal
Le **mapping produits** est manuel (ou semi-auto). Il faut une UI pour que les utilisateurs lient produits Weezevent → MenuItem. Sans ça, les analytics ventes vs coûts ne fonctionnent pas.

**Recommandation** : commencer par P0 (variants/components + mapping) avant de faire analytics.
