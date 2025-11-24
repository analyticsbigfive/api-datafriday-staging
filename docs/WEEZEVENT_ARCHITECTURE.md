# Analyse et Recommandation - Intégration API Weezevent

## 📋 Contexte

**Objectif:** Intégrer l'API Weezevent (WeezPay) dans la plateforme DataFriday pour gérer les transactions et les webhooks liés aux événements.

**Focus principal:** Transactions et toutes les données associées

**Documentation analysée:** API Reference Weezevent (WeezPay v1)

---

## 🔍 Analyse de l'API Weezevent

### Endpoints Critiques Identifiés

#### 1. **Transactions** (`/tag/Transactions`)

**GET /organizations/{organization_id}/transactions**
- Liste toutes les transactions d'une organisation
- Paramètres de filtrage disponibles
- Pagination supportée
- **Données retournées:**
  - ID transaction
  - Montant
  - Devise
  - Statut
  - Date/heure
  - Wallet associé
  - Event associé
  - Méthode de paiement

**GET /organizations/{organization_id}/transactions/{transaction_id}**
- Détails d'une transaction spécifique
- Informations complètes sur la transaction

**POST /organizations/{organization_id}/transactions/actions**
- Actions sur les transactions (batch operations)
- Permet de faire des opérations groupées

#### 2. **Webhooks** (`/tag/Webhooks`)

**Event: Transaction** (`webhookTransaction`)
- Notification en temps réel lors d'une nouvelle transaction
- **Payload contient:**
  - Données complètes de la transaction
  - Informations sur le wallet
  - Informations sur l'événement
  - Métadonnées

**Event: Topup** (`webhookRefill`)
- Notification lors d'un rechargement de wallet

**Event: Transfer** (`webhookTransfer`)
- Notification lors d'un transfert entre wallets

**Event: Update Wallet** (`webhookUpdateWallet`)
- Notification lors de la mise à jour d'un wallet

### Modèles de Données Principaux

```typescript
// Transaction
interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  walletId: string;
  eventId: string;
  merchantId: string;
  paymentMethodId: string;
  metadata?: Record<string, any>;
}

// Wallet
interface Wallet {
  id: string;
  balance: number;
  currency: string;
  userId: string;
  walletGroupId?: string;
}

// Event (Weezevent)
interface WeezeventEvent {
  id: string;
  name: string;
  organizationId: string;
  startDate: string;
  endDate: string;
}
```

### Authentification

**OAuth 2.0 - Client Credentials Grant**
- Bearer Token requis pour toutes les requêtes
- Format: `Authorization: Bearer {token}`
- Permissions basées sur les scopes

---

## 🏗️ Options d'Architecture

### Option 1: Intégration Backend NestJS ✅ **RECOMMANDÉE**

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DataFriday Backend (NestJS)              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Weezevent Integration Module               │  │
│  │                                                      │  │
│  │  ├── Services/                                      │  │
│  │  │   ├── weezevent-api.service.ts                  │  │
│  │  │   ├── weezevent-webhook.service.ts              │  │
│  │  │   └── weezevent-sync.service.ts                 │  │
│  │  │                                                  │  │
│  │  ├── Controllers/                                   │  │
│  │  │   ├── weezevent-webhook.controller.ts           │  │
│  │  │   └── weezevent-transactions.controller.ts      │  │
│  │  │                                                  │  │
│  │  ├── Entities/                                      │  │
│  │  │   ├── weezevent-transaction.entity.ts           │  │
│  │  │   ├── weezevent-wallet.entity.ts                │  │
│  │  │   └── weezevent-event.entity.ts                 │  │
│  │  │                                                  │  │
│  │  └── Jobs/ (BullMQ)                                 │  │
│  │      ├── sync-transactions.job.ts                   │  │
│  │      └── process-webhook.job.ts                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Database (Prisma + Supabase)            │  │
│  │                                                      │  │
│  │  ├── WeezeventTransaction                           │  │
│  │  ├── WeezeventWallet                                │  │
│  │  ├── WeezeventEvent                                 │  │
│  │  └── WeezeventWebhookLog                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
                    Weezevent API
```

#### Avantages ✅

1. **Cohérence architecturale**
   - S'intègre parfaitement avec l'architecture existante NestJS
   - Utilise les mêmes patterns (CQRS, DDD, Multi-tenant)
   - Réutilise l'infrastructure existante (auth, error handling, validation)

2. **Contrôle total**
   - Gestion fine des erreurs et retry logic
   - Logging centralisé
   - Monitoring et observabilité intégrés
   - Tests unitaires et d'intégration faciles

3. **Performance**
   - Pas de latence réseau supplémentaire
   - Cache local possible
   - Optimisation des requêtes

4. **Sécurité**
   - Gestion centralisée des credentials
   - RLS Supabase appliqué automatiquement
   - Isolation multi-tenant native

5. **Développement**
   - Équipe déjà familière avec NestJS
   - Debugging plus simple
   - Hot reload en développement
   - TypeScript end-to-end

6. **Coûts**
   - Pas de coûts supplémentaires (déjà dans le backend)
   - Pas de cold start

#### Inconvénients ⚠️

1. **Scalabilité**
   - Nécessite scaling du backend principal
   - Webhooks peuvent créer des pics de charge

2. **Déploiement**
   - Redéploiement du backend pour les changements
   - Pas de déploiement indépendant

---

### Option 2: Microservices Supabase (Edge Functions)

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                  │
│                                                             │
│  ├── weezevent-webhook-handler/                            │
│  │   └── index.ts                                          │
│  │                                                          │
│  ├── weezevent-sync-transactions/                          │
│  │   └── index.ts                                          │
│  │                                                          │
│  └── weezevent-api-proxy/                                  │
│      └── index.ts                                           │
└─────────────────────────────────────────────────────────────┘
                            ↕
                    Weezevent API
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Database                        │
│                                                             │
│  ├── WeezeventTransaction                                  │
│  ├── WeezeventWallet                                       │
│  └── WeezeventEvent                                        │
└─────────────────────────────────────────────────────────────┘
```

#### Avantages ✅

1. **Isolation**
   - Déploiement indépendant
   - Pas d'impact sur le backend principal

2. **Scalabilité automatique**
   - Auto-scaling par Supabase
   - Gestion des pics de charge

3. **Coûts potentiellement plus bas**
   - Pay-per-use
   - Pas de serveur à maintenir

#### Inconvénients ⚠️

1. **Complexité architecturale**
   - Architecture distribuée
   - Gestion de la cohérence des données
   - Debugging plus complexe

2. **Limitations techniques**
   - Cold start (latence initiale)
   - Timeout limité (généralement 60s)
   - Pas de jobs en background natifs
   - Pas de WebSocket pour les webhooks

3. **Développement**
   - Stack différent (Deno vs Node.js)
   - Pas de TypeScript partagé facilement
   - Tests plus complexes
   - Pas de hot reload

4. **Monitoring**
   - Logs dispersés
   - Monitoring séparé
   - Debugging difficile

5. **Sécurité**
   - Gestion des secrets séparée
   - Pas de RLS automatique
   - Authentification à gérer manuellement

6. **Maintenance**
   - Code dupliqué potentiel
   - Deux bases de code à maintenir
   - Versioning complexe

---

## 🎯 Recommandation Finale

### ✅ **Option 1: Intégration Backend NestJS**

**Justification:**

1. **Cohérence avec l'existant**
   - Votre architecture actuelle est déjà bien structurée avec NestJS
   - Multi-tenant natif avec RLS Supabase
   - Infrastructure de qualité (auth, error handling, validation)

2. **Simplicité de développement**
   - Une seule base de code
   - Stack technique homogène
   - Équipe déjà formée sur NestJS

3. **Contrôle et flexibilité**
   - Gestion fine des transactions
   - Retry logic personnalisée
   - Cache et optimisations possibles

4. **Coûts**
   - Pas de coûts supplémentaires
   - Infrastructure déjà en place

5. **Maintenabilité**
   - Code centralisé
   - Tests plus faciles
   - Debugging simplifié

**Quand considérer Option 2:**
- Si vous avez besoin d'une isolation totale
- Si le volume de webhooks est extrêmement élevé (>10k/min)
- Si vous voulez une équipe dédiée sur cette partie

---

## 📝 Plan d'Implémentation Recommandé

### Phase 1: Modèles de Données (Prisma)

```prisma
// prisma/schema.prisma

model WeezeventTransaction {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Transaction data
  amount            Decimal  @db.Decimal(10, 2)
  currency          String
  status            String
  transactionDate   DateTime
  
  // Relations
  walletId          String?
  eventId           String?
  merchantId        String?
  paymentMethodId   String?
  
  // Metadata
  metadata          Json?
  rawData           Json     // Store complete API response
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  wallet            WeezeventWallet?   @relation(fields: [walletId], references: [id])
  event             WeezeventEvent?    @relation(fields: [eventId], references: [id])
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([status])
  @@index([transactionDate])
}

model WeezeventWallet {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Wallet data
  balance           Decimal  @db.Decimal(10, 2)
  currency          String
  userId            String?
  walletGroupId     String?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactions      WeezeventTransaction[]
  
  @@index([tenantId])
  @@index([weezeventId])
}

model WeezeventEvent {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Event data
  name              String
  organizationId    String
  startDate         DateTime
  endDate           DateTime
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactions      WeezeventTransaction[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([startDate])
}

model WeezeventWebhookLog {
  id                String   @id @default(cuid())
  tenantId          String
  
  // Webhook data
  eventType         String   // 'transaction', 'topup', 'transfer', 'update_wallet'
  payload           Json
  signature         String?
  
  // Processing
  processed         Boolean  @default(false)
  processedAt       DateTime?
  error             String?
  retryCount        Int      @default(0)
  
  // Audit
  createdAt         DateTime @default(now())
  
  // Relations
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([eventType])
  @@index([processed])
  @@index([createdAt])
}

model WeezeventConfig {
  id                String   @id @default(cuid())
  tenantId          String   @unique
  
  // API Credentials
  clientId          String
  clientSecret      String   @db.Text // Encrypted
  organizationId    String
  
  // Webhook settings
  webhookUrl        String?
  webhookSecret     String?  @db.Text // Encrypted
  
  // Sync settings
  lastSyncAt        DateTime?
  syncEnabled       Boolean  @default(true)
  syncInterval      Int      @default(300) // seconds
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  // Relations
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
}
```

### Phase 2: Structure des Modules

```
src/features/weezevent/
├── weezevent.module.ts
├── config/
│   └── weezevent.config.ts
├── services/
│   ├── weezevent-api.service.ts          # API client
│   ├── weezevent-auth.service.ts         # OAuth handling
│   ├── weezevent-transaction.service.ts  # Transaction logic
│   ├── weezevent-webhook.service.ts      # Webhook processing
│   └── weezevent-sync.service.ts         # Background sync
├── controllers/
│   ├── weezevent-webhook.controller.ts   # Webhook endpoint
│   └── weezevent-transaction.controller.ts
├── dto/
│   ├── transaction.dto.ts
│   ├── webhook.dto.ts
│   └── sync.dto.ts
├── entities/
│   ├── weezevent-transaction.entity.ts
│   ├── weezevent-wallet.entity.ts
│   └── weezevent-event.entity.ts
├── jobs/
│   ├── sync-transactions.job.ts
│   └── process-webhook.job.ts
├── guards/
│   └── weezevent-webhook.guard.ts        # Verify webhook signature
└── interfaces/
    ├── weezevent-api.interface.ts
    └── weezevent-webhook.interface.ts
```

### Phase 3: Implémentation Prioritaire

**Ordre recommandé:**

1. **Configuration et Auth** (1-2 jours)
   - [ ] Module Weezevent
   - [ ] Service d'authentification OAuth
   - [ ] Configuration par tenant
   - [ ] Encryption des secrets

2. **API Client** (2-3 jours)
   - [ ] Service API Weezevent
   - [ ] Gestion des tokens
   - [ ] Retry logic
   - [ ] Error handling

3. **Transactions** (3-4 jours)
   - [ ] Modèles Prisma
   - [ ] Service de synchronisation
   - [ ] Endpoints CRUD
   - [ ] Tests

4. **Webhooks** (3-4 jours)
   - [ ] Controller webhook
   - [ ] Validation signature
   - [ ] Processing asynchrone (BullMQ)
   - [ ] Logging et monitoring

5. **Background Jobs** (2-3 jours)
   - [ ] Job de synchronisation périodique
   - [ ] Job de retry pour webhooks échoués
   - [ ] Monitoring

6. **Tests et Documentation** (2-3 jours)
   - [ ] Tests unitaires
   - [ ] Tests d'intégration
   - [ ] Documentation API
   - [ ] Guide de configuration

**Total estimé: 13-19 jours**

---

## 🔐 Considérations de Sécurité

1. **Credentials**
   - Stocker les secrets chiffrés dans la DB
   - Utiliser des variables d'environnement pour la clé de chiffrement
   - Rotation régulière des tokens

2. **Webhooks**
   - Valider la signature des webhooks
   - Rate limiting sur l'endpoint webhook
   - Logging de toutes les tentatives

3. **Multi-tenant**
   - Isolation stricte par tenant
   - RLS Supabase activé
   - Validation du tenantId à chaque requête

4. **API Calls**
   - Retry avec exponential backoff
   - Circuit breaker pattern
   - Timeout appropriés

---

## 📊 Monitoring et Observabilité

1. **Métriques à suivre**
   - Nombre de transactions synchronisées
   - Taux d'erreur API
   - Latence des webhooks
   - Taux de retry

2. **Alertes**
   - Échec de synchronisation
   - Webhooks non traités
   - Erreurs API répétées
   - Token expiré

3. **Logging**
   - Toutes les requêtes API
   - Tous les webhooks reçus
   - Toutes les erreurs
   - Toutes les synchronisations

---

## 🚀 Évolution Future

**Fonctionnalités additionnelles possibles:**

1. **Analytics**
   - Dashboard de transactions
   - Rapports financiers
   - Statistiques par événement

2. **Automatisation**
   - Actions automatiques sur certains événements
   - Notifications personnalisées
   - Intégration avec d'autres systèmes

3. **Optimisations**
   - Cache Redis pour les données fréquentes
   - Batch processing des transactions
   - Compression des données historiques

---

## 📌 Conclusion

**L'intégration dans le backend NestJS est la meilleure option** pour DataFriday car:

✅ Elle s'aligne avec votre architecture existante  
✅ Elle offre un meilleur contrôle et une meilleure maintenabilité  
✅ Elle est plus simple à développer et à tester  
✅ Elle n'ajoute pas de complexité architecturale  
✅ Elle est plus économique  

L'option microservices Supabase pourrait être envisagée plus tard si:
- Le volume de webhooks devient très élevé
- Vous avez besoin d'une isolation totale
- Vous voulez une équipe dédiée sur cette partie

**Prochaines étapes:**
1. Valider cette recommandation avec l'équipe
2. Créer les modèles Prisma
3. Implémenter le module de base
4. Tester avec l'API Weezevent en sandbox
