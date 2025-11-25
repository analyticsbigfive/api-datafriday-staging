# Documentation Weezevent - Guide Complet

## 📚 Vue d'ensemble

Cette documentation couvre l'intégration complète de l'API Weezevent (WeezPay) dans DataFriday, incluant le stockage des credentials, le client API, et la synchronisation des données.

---

## 🚀 Quick Start

### 1. Configuration des Credentials (Phase 1 ✅)

Les credentials Weezevent sont stockés de manière sécurisée par organisation (tenant).

**Endpoints:**
- `PATCH /onboarding/tenants/:id/weezevent` - Configurer
- `GET /onboarding/tenants/:id/weezevent` - Récupérer

**Documentation:** [WEEZEVENT_CREDENTIALS_USAGE.md](./WEEZEVENT_CREDENTIALS_USAGE.md)

### 2. Client API (Phase 2 ✅)

Client robuste pour communiquer avec l'API Weezevent.

**Features:**
- OAuth 2.0 automatique
- Token caching
- Retry avec exponential backoff
- Gestion d'erreurs complète

**Documentation:** [WEEZEVENT_API_CLIENT_USAGE.md](./WEEZEVENT_API_CLIENT_USAGE.md)

### 3. Synchronisation (Phase 3 ✅)

Synchronisation des transactions, wallets, et autres données en base.

**Features:**
- 8 modèles Prisma (Transaction, Wallet, User, Event, Product, etc.)
- Service de synchronisation avec upsert logic
- 6 endpoints API (transactions, events, products, sync, status)
- Support sync incrémentale et complète

**Documentation:** 
- [WEEZEVENT_SYNC_USER_GUIDE.md](./WEEZEVENT_SYNC_USER_GUIDE.md) - Guide utilisateur
- [WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md) - Documentation technique

---

## 📖 Documentation Technique

### Architecture et Planification

| Document | Description | Statut |
|----------|-------------|--------|
| [WEEZEVENT_ARCHITECTURE.md](./WEEZEVENT_ARCHITECTURE.md) | Analyse d'architecture et recommandations | ✅ Complet |
| [WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md) | Guide d'implémentation technique complet | ✅ Complet |
| [WEEZEVENT_DATA_MAPPING.md](./WEEZEVENT_DATA_MAPPING.md) | Mapping des données et relations | ✅ Complet |

### Implémentation

| Document | Description | Statut |
|----------|-------------|--------|
| [WEEZEVENT_CREDENTIALS_USAGE.md](./WEEZEVENT_CREDENTIALS_USAGE.md) | Stockage sécurisé des credentials | ✅ Phase 1 |
| [WEEZEVENT_API_CLIENT_USAGE.md](./WEEZEVENT_API_CLIENT_USAGE.md) | Utilisation du client API | ✅ Phase 2 |
| [WEEZEVENT_SYNC_USER_GUIDE.md](./WEEZEVENT_SYNC_USER_GUIDE.md) | Guide synchronisation données | ✅ Phase 3 |
| [WEEZEVENT_WEBHOOK_SETUP.md](./WEEZEVENT_WEBHOOK_SETUP.md) | Configuration webhooks temps réel | ✅ Phase 4 |
| [WEEZEVENT_WEBHOOK_QUICKSTART.md](./WEEZEVENT_WEBHOOK_QUICKSTART.md) | Démarrage rapide webhooks | ✅ Phase 4 |
| [WEEZEVENT_ANALYTICS_GUIDE.md](./WEEZEVENT_ANALYTICS_GUIDE.md) | Guide analytics et exploitation données | ✅ Phase 6 |
| [WEEZEVENT_PERFORMANCE_GUIDE.md](./WEEZEVENT_PERFORMANCE_GUIDE.md) | Optimisations performance | ✅ Phase 8 |

### Analytics et Cas d'Usage

| Document | Description | Statut |
|----------|-------------|--------|
| [WEEZEVENT_ANALYTICS.md](./WEEZEVENT_ANALYTICS.md) | Guide complet des analytics | 📋 Référence |
| [WEEZEVENT_FNB_MAPPING.md](./WEEZEVENT_FNB_MAPPING.md) | Mapping Food & Beverage | 📋 Référence |

---

## 🔐 Phase 1: Stockage des Credentials ✅

### Implémenté

- ✅ Champs Prisma dans le modèle `Tenant`
- ✅ Service de chiffrement AES-256-GCM
- ✅ DTOs et endpoints API
- ✅ Migration Docker

### Utilisation

```typescript
// Configurer Weezevent pour un tenant
PATCH /onboarding/tenants/:tenantId/weezevent
{
  "weezeventClientId": "app_...",
  "weezeventClientSecret": "secret...",
  "weezeventEnabled": true
}

// Récupérer la config (public, sans secret)
GET /onboarding/tenants/:tenantId/weezevent
```

**Guide complet:** [WEEZEVENT_CREDENTIALS_USAGE.md](./WEEZEVENT_CREDENTIALS_USAGE.md)

---

## 📡 Phase 2: Client API ✅

### Implémenté

- ✅ `WeezeventAuthService` - OAuth 2.0 + cache
- ✅ `WeezeventApiService` - HTTP + retry logic
- ✅ `WeezeventClientService` - Méthodes haut niveau
- ✅ Tests unitaires (30/30 passés)

### Utilisation

```typescript
import { WeezeventClientService } from './weezevent/services/weezevent-client.service';

// Récupérer des transactions
const transactions = await this.weezeventClient.getTransactions(
  tenantId,
  organizationId,
  { status: 'V', perPage: 50 }
);

// Informations client
const wallet = await this.weezeventClient.getWallet(tenantId, orgId, walletId);
const user = await this.weezeventClient.getUser(tenantId, orgId, userId);
```

**Guide complet:** [WEEZEVENT_API_CLIENT_USAGE.md](./WEEZEVENT_API_CLIENT_USAGE.md)

---

## 🔄 Phase 3: Synchronisation des Données ✅

### Implémenté

- ✅ 8 modèles Prisma (Event, Merchant, Location, Product, User, Wallet, Transaction, Item, Payment)
- ✅ Migration appliquée (8 tables + 44 indexes)
- ✅ `WeezeventSyncService` avec 5 méthodes de sync
- ✅ 6 endpoints API REST
- ✅ DTOs avec validation
- ✅ Tests unitaires (15 test cases)

### Endpoints

```typescript
// Déclencher une synchronisation
POST /weezevent/sync
{
  "type": "transactions",
  "fromDate": "2024-01-01",
  "toDate": "2024-12-31",
  "full": false
}

// Liste des transactions synchronisées
GET /weezevent/transactions?page=1&perPage=50&status=V

// Détail d'une transaction
GET /weezevent/transactions/:id

// Statut de synchronisation
GET /weezevent/sync/status

// Liste des événements
GET /weezevent/events?page=1&perPage=20

// Liste des produits
GET /weezevent/products?page=1&perPage=50&category=food
```

### Utilisation

```typescript
import { WeezeventSyncService } from './weezevent/services/weezevent-sync.service';

// Synchroniser les transactions
const result = await this.syncService.syncTransactions(
  tenantId,
  organizationId,
  {
    fromDate: new Date('2024-01-01'),
    toDate: new Date('2024-12-31'),
    full: false, // Incrémentale
  }
);

console.log(`Synced: ${result.itemsSynced}, Created: ${result.itemsCreated}`);
```

**Guides:**
- [WEEZEVENT_SYNC_USER_GUIDE.md](./WEEZEVENT_SYNC_USER_GUIDE.md) - Guide utilisateur complet
- [WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md) - Documentation technique

---

## 📊 Roadmap

### Phase 4: Webhooks (Optionnel)
- ✅ `WeezeventClientService` - Méthodes haut niveau
- ✅ Interfaces TypeScript complètes
- ✅ Gestion d'erreurs robuste

### Endpoints Disponibles

- **Transactions** - Liste et détails
- **Wallets** - Informations wallet
- **Users** - Données client
- **Events** - Événements
- **Products** - Catalogue produits

### Utilisation

```typescript
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';

constructor(
  private readonly weezeventClient: WeezeventClientService,
) {}

// Récupérer des transactions
const transactions = await this.weezeventClient.getTransactions(
  tenantId,
  organizationId,
  { status: 'V', perPage: 50 }
);
```

**Guide complet:** [WEEZEVENT_API_CLIENT_USAGE.md](./WEEZEVENT_API_CLIENT_USAGE.md)

---

## 🔄 Phase 3: Synchronisation (À venir)

### À Implémenter

- [ ] Modèles Prisma pour stocker les données
- [ ] Service de synchronisation
- [ ] Endpoints CRUD
- [ ] Background jobs
- [ ] Webhooks

**Plan détaillé:** [WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md#modèles-de-données-prisma)

---

## 📊 Données Disponibles

### Entités Principales

| Entité | Endpoint | Priorité | Données Clés |
|--------|----------|----------|--------------|
| **Transactions** | `/transactions` | 🔴 Haute | Montant, produits, paiements |
| **Wallets** | `/wallets` | 🔴 Haute | Balance, user_id, card |
| **Users** | `/users` | 🔴 Haute | Nom, email, téléphone, adresse |
| **Events** | `/events` | 🔴 Haute | Dates, lieu, capacité |
| **Products** | `/products` | 🔴 Haute | Prix, allergènes, composants |
| **Merchants** | `/fundations` | 🟡 Moyenne | Nom, contact |
| **Locations** | `/locations` | 🟡 Moyenne | Zone, coordonnées |

### Informations Client

Via `wallet_id` → `user_id`:
- ✅ Nom, prénom, email
- ✅ Téléphone, adresse complète
- ✅ Date de naissance
- ✅ Solde wallet
- ✅ Historique transactions
- ✅ Consentements RGPD

---

## 🔔 Webhooks

### Événements Disponibles

| Événement | Type | Description |
|-----------|------|-------------|
| Transaction Created/Updated | `transaction` | Nouvelle transaction ou mise à jour |
| Wallet Topup | `topup` | Rechargement wallet |
| Wallet Transfer | `transfer` | Transfert entre wallets |
| Wallet Updated | `wallet.updated` | Mise à jour wallet |

**Configuration:** [WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md#webhooks)

---

## 🔒 Sécurité

### Implémenté

- ✅ Chiffrement AES-256-GCM des secrets
- ✅ Tokens OAuth cachés en mémoire
- ✅ HTTPS uniquement
- ✅ Pas de leak dans les logs
- ✅ Multi-tenant isolation (RLS)

### À Implémenter

- [ ] Validation signatures webhook
- [ ] Rate limiting
- [ ] Circuit breaker pattern

---

## 📈 Analytics

### Cas d'Usage

- 📊 Analytics par événement (CA, produits populaires)
- 🏪 Analytics par marchand (performance, top produits)
- 📍 Analytics par zone (revenus, affluence)
- 👥 Analytics client (profil, rétention)
- 💰 Rapports financiers (par catégorie, méthode paiement)

**Guide complet:** [WEEZEVENT_ANALYTICS.md](./WEEZEVENT_ANALYTICS.md)

---

## 🛠️ Développement

### Structure du Code

```
src/features/weezevent/
├── weezevent.module.ts
├── services/
│   ├── weezevent-auth.service.ts
│   ├── weezevent-api.service.ts
│   └── weezevent-client.service.ts
├── interfaces/
│   ├── weezevent.interface.ts
│   └── weezevent-entities.interface.ts
└── exceptions/
    ├── weezevent-auth.exception.ts
    └── weezevent-api.exception.ts
```

### Tests

```bash
# Unit tests
npm test -- weezevent

# Integration tests
npm run test:e2e -- weezevent
```

---

## 📋 Plan d'Implémentation Complet

### Phase 1: Configuration et Auth ✅ (1-2 jours)
- ✅ Stockage credentials par tenant
- ✅ Service de chiffrement
- ✅ Endpoints API

### Phase 2: API Client ✅ (2-3 jours)
- ✅ Service d'authentification OAuth
- ✅ Client HTTP avec retry
- ✅ Méthodes haut niveau

### Phase 3: Transactions (3-4 jours)
- [ ] Modèles Prisma
- [ ] Service de synchronisation
- [ ] Endpoints CRUD
- [ ] Tests

### Phase 4: Webhooks (3-4 jours)
- [ ] Controller webhook
- [ ] Validation signature
- [ ] Processing asynchrone (BullMQ)
- [ ] Logging et monitoring

### Phase 5: Background Jobs (2-3 jours)
- [ ] Job de synchronisation périodique
- [ ] Job de retry pour webhooks échoués
- [ ] Monitoring

### Phase 6: Tests et Documentation (2-3 jours)
- [ ] Tests unitaires
- [ ] Tests d'intégration
- [ ] Documentation API
- [ ] Guide de configuration

**Total estimé: 13-19 jours**  
**Progression: 2/6 phases complétées (33%)**

---

## 🔗 Liens Utiles

- [API Reference Weezevent](https://developers.weezevent.com/)
- [Documentation Supabase](../SUPABASE.md)
- [Architecture DataFriday](../ARCHITECTURE.md)

---

**Dernière mise à jour:** 2025-11-24  
**Statut:** Phase 2 complétée, Phase 3 en planification
