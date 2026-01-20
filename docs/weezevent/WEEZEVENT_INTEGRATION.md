# Documentation Technique - Intégration API Weezevent

## 📚 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Authentification](#authentification)
3. [Endpoints API](#endpoints-api)
4. [Modèles de Données](#modèles-de-données)
5. [Webhooks](#webhooks)
6. [Stratégie de Synchronisation](#stratégie-de-synchronisation)
7. [Guide d'Implémentation](#guide-dimplémentation)
8. [Exemples de Code](#exemples-de-code)
9. [Sécurité et Best Practices](#sécurité-et-best-practices)

---

## 🎯 Vue d'ensemble

### Contexte

L'API Weezevent (WeezPay) permet de gérer les transactions, wallets, et événements pour des systèmes de paiement cashless lors d'événements.

**URL de base:** `https://api.weezevent.com/pay/v1`

**Version:** v1 (stable)

### Objectifs de l'Intégration

1. **Synchroniser les transactions** en temps réel
2. **Récupérer les données clients** via les wallets
3. **Enrichir les données** avec les informations d'événements, produits, etc.
4. **Générer des analytics** détaillés
5. **Maintenir la cohérence** multi-tenant

---

## 🔐 Authentification

### OAuth 2.0 - Client Credentials Grant

**Endpoint:** `POST /oauth/token`

**Request:**
```http
POST https://api.weezevent.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={YOUR_CLIENT_ID}
&client_secret={YOUR_CLIENT_SECRET}
&scope=transactions.read wallets.read events.read
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "transactions.read wallets.read events.read"
}
```

**Utilisation:**
```http
GET /organizations/{organization_id}/transactions
Authorization: Bearer {access_token}
```

### Gestion des Tokens

```typescript
// Service d'authentification
export class WeezeventAuthService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async getAccessToken(): Promise<string> {
    // Vérifier si le token est encore valide
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    // Récupérer un nouveau token
    const response = await this.requestNewToken();
    this.token = response.access_token;
    this.tokenExpiry = new Date(Date.now() + response.expires_in * 1000);
    
    return this.token;
  }

  private async requestNewToken() {
    const config = await this.getWeezeventConfig();
    
    const response = await axios.post(
      'https://api.weezevent.com/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: this.decrypt(config.clientSecret),
        scope: 'transactions.read wallets.read events.read products.read'
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    
    return response.data;
  }
}
```

---

## 📡 Endpoints API

### 1. Transactions

#### GET /organizations/{organization_id}/transactions

**Description:** Liste toutes les transactions

**Query Parameters:**
- `page` (integer): Numéro de page
- `per_page` (integer): Nombre d'éléments par page (max: 100)
- `status` (string): Filtrer par statut (W, V, C, R)
- `from_date` (datetime): Date de début
- `to_date` (datetime): Date de fin
- `event_id` (integer): Filtrer par événement

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "application_id": 45,
      "event_id": 1,
      "event_name": "MusicFest",
      "fundation_id": 3,
      "fundation_name": "The Burger Corner",
      "location_id": 12,
      "location_name": "Northern foodtruck area",
      "seller_id": 2,
      "seller_wallet_id": 18,
      "status": "W",
      "created": "2021-04-16T18:10:00Z",
      "updated": "2021-04-22T14:05:00Z",
      "rows": [
        {
          "id": 123,
          "item_id": 5,
          "compound_id": 124,
          "component": true,
          "unit_price": 500,
          "vat": 5.5,
          "reduction": 0.1,
          "payments": [
            {
              "id": 123,
              "wallet_id": 42,
              "balance_id": 24,
              "amount": 1200,
              "amount_vat": 150.5,
              "currency_id": 1,
              "quantity": 2,
              "payment_method_id": 4,
              "invoice_id": 11
            }
          ]
        }
      ]
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 1250,
    "total_pages": 25
  }
}
```

**Statuts:**
- `W` - En attente (Waiting)
- `V` - Validée (Validated)
- `C` - Annulée (Cancelled)
- `R` - Remboursée (Refunded)

#### GET /organizations/{organization_id}/transactions/{transaction_id}

**Description:** Détails d'une transaction spécifique

**Response:** Même structure qu'une transaction dans la liste

---

### 2. Wallets (Informations Client)

#### GET /organizations/{organization_id}/wallets/{wallet_id}

**Description:** Récupère les informations d'un wallet (client ou vendeur)

**Response:**
```json
{
  "id": 42,
  "balance": 5000,
  "currency_id": 1,
  "user_id": 156,
  "wallet_group_id": 5,
  "status": "active",
  "created_at": "2021-04-01T10:00:00Z",
  "updated_at": "2021-04-22T14:05:00Z",
  "metadata": {
    "card_number": "WZ-123456",
    "card_type": "rfid"
  }
}
```

#### GET /organizations/{organization_id}/wallets

**Description:** Liste tous les wallets

**Query Parameters:**
- `page`, `per_page`
- `status` (string): active, inactive, blocked
- `user_id` (integer): Filtrer par utilisateur

---

### 3. Users (Informations Client Détaillées)

#### GET /organizations/{organization_id}/users/{user_id}

**Description:** Récupère les informations complètes d'un utilisateur/client

**Response:**
```json
{
  "id": 156,
  "email": "client@example.com",
  "first_name": "Marie",
  "last_name": "Dupont",
  "phone": "+33612345678",
  "birthdate": "1990-05-15",
  "address": {
    "street": "123 Rue de la Paix",
    "city": "Paris",
    "postal_code": "75001",
    "country": "FR"
  },
  "wallet_id": 42,
  "created_at": "2021-04-01T10:00:00Z",
  "metadata": {
    "gdpr_consent": true,
    "marketing_consent": false
  }
}
```

**Données client disponibles:**
- ✅ Informations personnelles (nom, prénom, email)
- ✅ Coordonnées (téléphone, adresse)
- ✅ Date de naissance
- ✅ Wallet associé
- ✅ Consentements RGPD
- ✅ Métadonnées personnalisées

---

### 4. Events

#### GET /organizations/{organization_id}/events/{event_id}

**Response:**
```json
{
  "id": 1,
  "name": "MusicFest 2021",
  "organization_id": 102045,
  "start_date": "2021-04-16T00:00:00Z",
  "end_date": "2021-04-18T23:59:59Z",
  "description": "Festival de musique annuel",
  "location": "Parc des Expositions, Paris",
  "capacity": 5000,
  "status": "active",
  "metadata": {
    "genres": ["rock", "pop", "electronic"],
    "age_restriction": "18+"
  }
}
```

---

### 5. Products

#### GET /organizations/{organization_id}/products/{product_id}

**Response:**
```json
{
  "id": 5,
  "name": "Burger Deluxe",
  "description": "Burger avec fromage, bacon et sauce maison",
  "category": "food",
  "base_price": 500,
  "vat_rate": 5.5,
  "image": "https://cdn.weezevent.com/products/burger-deluxe.jpg",
  "allergens": ["gluten", "dairy", "eggs"],
  "components": [
    {
      "id": 124,
      "name": "Pain burger",
      "quantity": 1
    },
    {
      "id": 125,
      "name": "Steak haché",
      "quantity": 1
    }
  ],
  "variants": [
    {
      "id": 51,
      "name": "Burger Deluxe - Sans fromage",
      "price": 450
    }
  ],
  "metadata": {
    "preparation_time": 10,
    "calories": 650
  }
}
```

---

### 6. Fundations (Merchants)

#### GET /organizations/{organization_id}/fundations/{fundation_id}

**Response:**
```json
{
  "id": 3,
  "name": "The Burger Corner",
  "organization_id": 102045,
  "description": "Stand de burgers artisanaux",
  "contact": {
    "email": "contact@burgercorner.com",
    "phone": "+33123456789"
  },
  "address": {
    "street": "Stand 12",
    "city": "Paris",
    "postal_code": "75001"
  },
  "metadata": {
    "cuisine_type": "american",
    "rating": 4.5
  }
}
```

---

### 7. Locations

#### GET /organizations/{organization_id}/locations/{location_id}

**Response:**
```json
{
  "id": 12,
  "name": "Northern foodtruck area",
  "event_id": 1,
  "type": "foodtruck_area",
  "capacity": 100,
  "coordinates": {
    "latitude": 48.8566,
    "longitude": 2.3522,
    "x": 123.45,
    "y": 67.89
  },
  "metadata": {
    "zone": "north",
    "accessibility": true
  }
}
```

---

### 8. Currencies

#### GET /organizations/{organization_id}/currencies/{currency_id}

**Response:**
```json
{
  "id": 1,
  "code": "EUR",
  "name": "Euro",
  "symbol": "€",
  "exchange_rate": 1.0,
  "is_default": true
}
```

---

### 9. Payment Methods

#### GET /organizations/{organization_id}/payment-methods/{payment_method_id}

**Response:**
```json
{
  "id": 4,
  "name": "Carte Bancaire",
  "type": "card",
  "enabled": true,
  "fees": {
    "fixed": 0,
    "percentage": 2.5
  },
  "metadata": {
    "provider": "stripe",
    "supported_cards": ["visa", "mastercard"]
  }
}
```

---

## 🔔 Webhooks

### Configuration

**Endpoint à fournir:** `https://your-domain.com/api/v1/webhooks/weezevent`

**Méthode:** POST

**Headers:**
```
Content-Type: application/json
X-Weezevent-Signature: sha256={signature}
```

### Événements Disponibles

#### 1. Transaction Created/Updated

**Event Type:** `transaction`

**Payload:**
```json
{
  "event": "transaction.created",
  "timestamp": "2021-04-22T14:05:00Z",
  "organization_id": 102045,
  "data": {
    "id": 123,
    "status": "V",
    "amount": 1200,
    "currency_id": 1,
    "event_id": 1,
    "wallet_id": 42,
    "seller_wallet_id": 18,
    "items": [...]
  }
}
```

#### 2. Wallet Topup

**Event Type:** `topup`

**Payload:**
```json
{
  "event": "wallet.topup",
  "timestamp": "2021-04-22T14:05:00Z",
  "organization_id": 102045,
  "data": {
    "wallet_id": 42,
    "amount": 5000,
    "currency_id": 1,
    "payment_method_id": 4,
    "new_balance": 10000
  }
}
```

#### 3. Wallet Transfer

**Event Type:** `transfer`

**Payload:**
```json
{
  "event": "wallet.transfer",
  "timestamp": "2021-04-22T14:05:00Z",
  "organization_id": 102045,
  "data": {
    "from_wallet_id": 42,
    "to_wallet_id": 18,
    "amount": 1200,
    "currency_id": 1,
    "reason": "purchase"
  }
}
```

#### 4. Wallet Updated

**Event Type:** `wallet.updated`

**Payload:**
```json
{
  "event": "wallet.updated",
  "timestamp": "2021-04-22T14:05:00Z",
  "organization_id": 102045,
  "data": {
    "wallet_id": 42,
    "balance": 8800,
    "status": "active",
    "updated_fields": ["balance"]
  }
}
```

### Validation de Signature

```typescript
import * as crypto from 'crypto';

function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return `sha256=${expectedSignature}` === signature;
}
```

---

## 💾 Modèles de Données (Prisma)

### Schema Complet

```prisma
// ==================== WEEZEVENT INTEGRATION ====================

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

model WeezeventEvent {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Event data
  name              String
  organizationId    String
  startDate         DateTime
  endDate           DateTime
  description       String?
  location          String?
  capacity          Int?
  status            String
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactions      WeezeventTransaction[]
  locations         WeezeventLocation[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([startDate])
}

model WeezeventMerchant {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Merchant data
  name              String
  organizationId    String
  description       String?
  email             String?
  phone             String?
  address           Json?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactions      WeezeventTransaction[]
  
  @@index([tenantId])
  @@index([weezeventId])
}

model WeezeventLocation {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  eventId           String?
  
  // Location data
  name              String
  type              String?
  capacity          Int?
  coordinates       Json?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event             WeezeventEvent?          @relation(fields: [eventId], references: [id])
  transactions      WeezeventTransaction[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([eventId])
}

model WeezeventProduct {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Product data
  name              String
  description       String?
  category          String?
  basePrice         Decimal  @db.Decimal(10, 2)
  vatRate           Decimal  @db.Decimal(5, 2)
  image             String?
  allergens         String[]
  
  // Composition
  isCompound        Boolean  @default(false)
  components        Json?
  variants          Json?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  transactionItems  WeezeventTransactionItem[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([category])
}

model WeezeventUser {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // User data (Client)
  email             String?
  firstName         String?
  lastName          String?
  phone             String?
  birthdate         DateTime?
  address           Json?
  
  // Wallet
  walletId          String?
  
  // GDPR
  gdprConsent       Boolean  @default(false)
  marketingConsent  Boolean  @default(false)
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  wallet            WeezeventWallet?  @relation(fields: [walletId], references: [id])
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([email])
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
  status            String
  
  // Card info
  cardNumber        String?
  cardType          String?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user              WeezeventUser[]
  sellerTransactions WeezeventTransaction[] @relation("SellerWallet")
  payments          WeezeventPayment[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([userId])
}

model WeezeventTransaction {
  id                String   @id @default(cuid())
  weezeventId       String   @unique
  tenantId          String
  
  // Transaction data
  amount            Decimal  @db.Decimal(10, 2)
  status            String
  transactionDate   DateTime
  
  // Relations IDs
  eventId           String?
  merchantId        String?
  locationId        String?
  sellerId          String?
  sellerWalletId    String?
  
  // Metadata
  metadata          Json?
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  syncedAt          DateTime @default(now())
  
  // Relations
  tenant            Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event             WeezeventEvent?             @relation(fields: [eventId], references: [id])
  merchant          WeezeventMerchant?          @relation(fields: [merchantId], references: [id])
  location          WeezeventLocation?          @relation(fields: [locationId], references: [id])
  sellerWallet      WeezeventWallet?            @relation("SellerWallet", fields: [sellerWalletId], references: [id])
  items             WeezeventTransactionItem[]
  
  @@index([tenantId])
  @@index([weezeventId])
  @@index([eventId])
  @@index([merchantId])
  @@index([locationId])
  @@index([status])
  @@index([transactionDate])
}

model WeezeventTransactionItem {
  id                String   @id @default(cuid())
  transactionId     String
  
  // Item data
  productId         String?
  compoundId        String?
  quantity          Int
  unitPrice         Decimal  @db.Decimal(10, 2)
  vat               Decimal  @db.Decimal(5, 2)
  reduction         Decimal  @db.Decimal(5, 2)
  
  // Metadata
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  
  // Relations
  transaction       WeezeventTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  product           WeezeventProduct?    @relation(fields: [productId], references: [id])
  payments          WeezeventPayment[]
  
  @@index([transactionId])
  @@index([productId])
}

model WeezeventPayment {
  id                String   @id @default(cuid())
  itemId            String
  
  // Payment data
  walletId          String?
  amount            Decimal  @db.Decimal(10, 2)
  amountVat         Decimal  @db.Decimal(10, 2)
  currencyId        String?
  quantity          Int
  paymentMethodId   String?
  
  // Metadata
  rawData           Json
  
  // Audit
  createdAt         DateTime @default(now())
  
  // Relations
  item              WeezeventTransactionItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  wallet            WeezeventWallet?         @relation(fields: [walletId], references: [id])
  
  @@index([itemId])
  @@index([walletId])
}

model WeezeventWebhookLog {
  id                String   @id @default(cuid())
  tenantId          String
  
  // Webhook data
  eventType         String
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
```

---

## 🔄 Stratégie de Synchronisation

### Architecture de Sync

```
┌─────────────────────────────────────────────────────────┐
│                    Sync Strategy                        │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  1. Initial Sync (Référentiels)                 │  │
│  │     - Events                                     │  │
│  │     - Merchants                                  │  │
│  │     - Locations                                  │  │
│  │     - Products                                   │  │
│  │     - Currencies                                 │  │
│  │     - Payment Methods                            │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  2. Historical Sync (Transactions)               │  │
│  │     - Last 30 days                               │  │
│  │     - Enrichissement automatique                 │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  3. Real-time Sync (Webhooks)                    │  │
│  │     - New transactions                           │  │
│  │     - Wallet updates                             │  │
│  │     - Topups/Transfers                           │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  4. Periodic Sync (Cron Jobs)                    │  │
│  │     - Every 5 minutes: Recent transactions       │  │
│  │     - Every hour: Wallets balances               │  │
│  │     - Every day: Full reconciliation             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Implémentation

```typescript
// Job de synchronisation
@Injectable()
export class WeezeventSyncService {
  
  // 1. Sync initial
  async initialSync(tenantId: string) {
    await this.syncEvents(tenantId);
    await this.syncMerchants(tenantId);
    await this.syncLocations(tenantId);
    await this.syncProducts(tenantId);
    await this.syncCurrencies(tenantId);
    await this.syncPaymentMethods(tenantId);
    
    // Sync transactions des 30 derniers jours
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    await this.syncTransactions(tenantId, fromDate);
  }
  
  // 2. Sync transactions
  async syncTransactions(
    tenantId: string,
    fromDate?: Date,
    toDate?: Date
  ) {
    const config = await this.getConfig(tenantId);
    const transactions = await this.weezeventApi.getTransactions({
      organizationId: config.organizationId,
      fromDate,
      toDate,
      perPage: 100
    });
    
    for (const transaction of transactions) {
      await this.processTransaction(tenantId, transaction);
    }
  }
  
  // 3. Process transaction avec enrichissement
  async processTransaction(tenantId: string, transaction: any) {
    // Récupérer les données enrichies
    const enriched = await this.enrichTransaction(transaction);
    
    // Sauvegarder la transaction
    await this.prisma.weezeventTransaction.upsert({
      where: { weezeventId: transaction.id.toString() },
      create: {
        weezeventId: transaction.id.toString(),
        tenantId,
        amount: transaction.rows.reduce((sum, row) => 
          sum + row.payments.reduce((s, p) => s + p.amount, 0), 0
        ),
        status: transaction.status,
        transactionDate: new Date(transaction.created),
        eventId: enriched.event?.id,
        merchantId: enriched.merchant?.id,
        locationId: enriched.location?.id,
        sellerWalletId: enriched.sellerWallet?.id,
        rawData: transaction,
        syncedAt: new Date()
      },
      update: {
        status: transaction.status,
        syncedAt: new Date()
      }
    });
    
    // Sauvegarder les items
    for (const row of transaction.rows) {
      await this.processTransactionItem(
        tenantId,
        transaction.id,
        row,
        enriched
      );
    }
  }
  
  // 4. Enrichir la transaction
  async enrichTransaction(transaction: any) {
    const [event, merchant, location, sellerWallet, products] = 
      await Promise.all([
        this.getOrSyncEvent(transaction.event_id),
        this.getOrSyncMerchant(transaction.fundation_id),
        this.getOrSyncLocation(transaction.location_id),
        this.getOrSyncWallet(transaction.seller_wallet_id),
        this.getOrSyncProducts(
          transaction.rows.map(r => r.item_id)
        )
      ]);
    
    return { event, merchant, location, sellerWallet, products };
  }
  
  // 5. Récupérer les infos client
  async getClientInfo(walletId: string) {
    // Récupérer le wallet
    const wallet = await this.weezeventApi.getWallet(walletId);
    
    // Récupérer l'utilisateur
    if (wallet.user_id) {
      const user = await this.weezeventApi.getUser(wallet.user_id);
      
      // Sauvegarder les infos client
      await this.prisma.weezeventUser.upsert({
        where: { weezeventId: user.id.toString() },
        create: {
          weezeventId: user.id.toString(),
          tenantId: this.tenantId,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          birthdate: user.birthdate ? new Date(user.birthdate) : null,
          address: user.address,
          walletId: wallet.id.toString(),
          gdprConsent: user.metadata?.gdpr_consent || false,
          marketingConsent: user.metadata?.marketing_consent || false,
          rawData: user,
          syncedAt: new Date()
        },
        update: {
          email: user.email,
          phone: user.phone,
          syncedAt: new Date()
        }
      });
      
      return user;
    }
    
    return null;
  }
}
```

---

## 📝 Guide d'Implémentation

### Étape 1: Configuration

```bash
# 1. Ajouter les modèles Prisma
npx prisma migrate dev --name add_weezevent_models

# 2. Générer le client Prisma
npx prisma generate
```

### Étape 2: Module Weezevent

```typescript
// src/features/weezevent/weezevent.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WeezeventApiService } from './services/weezevent-api.service';
import { WeezeventAuthService } from './services/weezevent-auth.service';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WeezeventWebhookService } from './services/weezevent-webhook.service';
import { WeezeventWebhookController } from './controllers/weezevent-webhook.controller';
import { WeezeventTransactionController } from './controllers/weezevent-transaction.controller';
import { SyncTransactionsJob } from './jobs/sync-transactions.job';
import { ProcessWebhookJob } from './jobs/process-webhook.job';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'weezevent-sync',
    }),
    BullModule.registerQueue({
      name: 'weezevent-webhooks',
    }),
  ],
  controllers: [
    WeezeventWebhookController,
    WeezeventTransactionController,
  ],
  providers: [
    WeezeventApiService,
    WeezeventAuthService,
    WeezeventSyncService,
    WeezeventWebhookService,
    SyncTransactionsJob,
    ProcessWebhookJob,
  ],
  exports: [
    WeezeventApiService,
    WeezeventSyncService,
  ],
})
export class WeezeventModule {}
```

### Étape 3: Webhook Controller

```typescript
// src/features/weezevent/controllers/weezevent-webhook.controller.ts
import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { WeezeventWebhookService } from '../services/weezevent-webhook.service';
import { WeezeventWebhookGuard } from '../guards/weezevent-webhook.guard';

@Controller('webhooks/weezevent')
export class WeezeventWebhookController {
  constructor(
    private readonly webhookService: WeezeventWebhookService
  ) {}
  
  @Post()
  @HttpCode(200)
  @UseGuards(WeezeventWebhookGuard)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-weezevent-signature') signature: string
  ) {
    // Logger le webhook
    await this.webhookService.logWebhook(payload, signature);
    
    // Traiter de manière asynchrone
    await this.webhookService.processWebhook(payload);
    
    return { received: true };
  }
}
```

### Étape 4: Cron Jobs

```typescript
// src/features/weezevent/jobs/sync-transactions.job.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WeezeventSyncService } from '../services/weezevent-sync.service';

@Injectable()
export class SyncTransactionsJob {
  constructor(
    private readonly syncService: WeezeventSyncService
  ) {}
  
  // Sync toutes les 5 minutes
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncRecentTransactions() {
    const tenants = await this.getActiveTenants();
    
    for (const tenant of tenants) {
      const fromDate = new Date();
      fromDate.setMinutes(fromDate.getMinutes() - 10); // 10 min de overlap
      
      await this.syncService.syncTransactions(
        tenant.id,
        fromDate
      );
    }
  }
  
  // Reconciliation complète quotidienne
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyReconciliation() {
    const tenants = await this.getActiveTenants();
    
    for (const tenant of tenants) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 1);
      
      await this.syncService.syncTransactions(
        tenant.id,
        fromDate
      );
    }
  }
}
```

---

## 🔒 Sécurité et Best Practices

### 1. Encryption des Secrets

```typescript
import * as crypto from 'crypto';

export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  
  constructor() {
    this.key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  }
  
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### 2. Rate Limiting

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class WeezeventWebhookGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Limiter par IP
    return req.ip;
  }
}
```

### 3. Retry Logic

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### 4. Circuit Breaker

```typescript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(
  async (url: string) => {
    return await axios.get(url);
  },
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  }
);

breaker.fallback(() => {
  return { data: null, cached: true };
});
```

---

## 📊 Monitoring et Logging

### Métriques à Suivre

```typescript
// Prometheus metrics
import { Counter, Histogram } from 'prom-client';

const transactionsSynced = new Counter({
  name: 'weezevent_transactions_synced_total',
  help: 'Total transactions synchronized',
  labelNames: ['tenant_id', 'status']
});

const apiCallDuration = new Histogram({
  name: 'weezevent_api_call_duration_seconds',
  help: 'Duration of Weezevent API calls',
  labelNames: ['endpoint', 'method']
});

const webhookProcessingDuration = new Histogram({
  name: 'weezevent_webhook_processing_duration_seconds',
  help: 'Duration of webhook processing'
});
```

### Logging

```typescript
import { Logger } from '@nestjs/common';

export class WeezeventApiService {
  private readonly logger = new Logger(WeezeventApiService.name);
  
  async getTransactions(params: any) {
    this.logger.log(`Fetching transactions for org ${params.organizationId}`);
    
    try {
      const response = await this.httpClient.get('/transactions', { params });
      
      this.logger.log(
        `Fetched ${response.data.length} transactions`
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch transactions: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
```

---

## 🎯 Résumé

### Checklist d'Implémentation

- [ ] Configurer l'authentification OAuth
- [ ] Créer les modèles Prisma
- [ ] Implémenter le service API
- [ ] Implémenter le service de sync
- [ ] Configurer les webhooks
- [ ] Créer les jobs de synchronisation
- [ ] Implémenter l'encryption des secrets
- [ ] Ajouter le monitoring
- [ ] Tester en sandbox
- [ ] Déployer en production

### Données Client Disponibles

✅ **Informations personnelles** (nom, prénom, email, téléphone)  
✅ **Adresse complète**  
✅ **Date de naissance**  
✅ **Wallet et solde**  
✅ **Historique des transactions**  
✅ **Consentements RGPD**  
✅ **Métadonnées personnalisées**

### Points Clés

1. **Multi-tenant** - Isolation stricte par tenant
2. **Temps réel** - Webhooks pour les mises à jour instantanées
3. **Enrichissement** - Données complètes avec toutes les relations
4. **Sécurité** - Encryption, validation, rate limiting
5. **Performance** - Cache, retry logic, circuit breaker
6. **Monitoring** - Métriques, logs, alertes
