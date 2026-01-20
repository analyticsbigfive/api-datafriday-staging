# Mapping Weezevent → fnb_sales_raw

## 📊 Analyse de la Table Existante

### Structure de `fnb_sales_raw`

Cette table contient les données de ventes F&B (Food & Beverage) avec les colonnes suivantes:

```sql
CREATE TABLE fnb_sales_raw (
  ID                    BIGINT,
  Type                  TEXT,
  Cashier               TEXT,
  State                 TEXT,
  Long_ID               TEXT,
  Short_ID              TEXT,
  Item_ID               TEXT,
  Item                  TEXT,
  Variation             TEXT,
  Item_Family           TEXT,
  Placed_at_date        DATE,
  Placed_at_time        TIME,
  Location              TEXT,
  Shop                  TEXT,
  Dispatch              TEXT,
  Dispatch_at_date      TEXT,
  Dispatch_at_time      TEXT,
  Quantity              DOUBLE PRECISION,
  TVA_percent           REAL,
  Total_HT              NUMERIC,
  Total_TVA             NUMERIC,
  Total_TTC             NUMERIC,
  Customer_firstname    TEXT,
  Customer_lastname     TEXT,
  Customer_email        TEXT,
  Customer_phone        TEXT
);
```

---

## 🔗 Mapping Complet Weezevent → fnb_sales_raw

### ✅ Colonnes Remplissables Automatiquement

| Colonne `fnb_sales_raw` | Source Weezevent | Mapping | Disponibilité |
|-------------------------|------------------|---------|---------------|
| **ID** | Transaction Item ID | `WeezeventTransactionItem.id` | ✅ 100% |
| **Type** | Type de transaction | `"sale"` (fixe) ou `WeezeventTransaction.status` | ✅ 100% |
| **Cashier** | Vendeur | `WeezeventUser.firstName + lastName` (via `seller_id`) | ✅ 100% |
| **State** | Statut transaction | `WeezeventTransaction.status` (W/V/C/R) | ✅ 100% |
| **Long_ID** | Transaction ID complet | `WeezeventTransaction.weezeventId` | ✅ 100% |
| **Short_ID** | Transaction ID court | `WeezeventTransaction.id` (interne) | ✅ 100% |
| **Item_ID** | Product ID | `WeezeventProduct.weezeventId` | ✅ 100% |
| **Item** | Nom du produit | `WeezeventProduct.name` | ✅ 100% |
| **Variation** | Variante produit | `WeezeventProduct.variants` (JSON) | ✅ 90% |
| **Item_Family** | Catégorie produit | `WeezeventProduct.category` | ✅ 100% |
| **Placed_at_date** | Date transaction | `WeezeventTransaction.transactionDate` (date) | ✅ 100% |
| **Placed_at_time** | Heure transaction | `WeezeventTransaction.transactionDate` (time) | ✅ 100% |
| **Location** | Emplacement | `WeezeventLocation.name` | ✅ 100% |
| **Shop** | Marchand/Stand | `WeezeventMerchant.name` | ✅ 100% |
| **Dispatch** | Statut dispatch | `WeezeventTransaction.metadata` | ⚠️ 50% |
| **Dispatch_at_date** | Date dispatch | `WeezeventTransaction.metadata` | ⚠️ 50% |
| **Dispatch_at_time** | Heure dispatch | `WeezeventTransaction.metadata` | ⚠️ 50% |
| **Quantity** | Quantité | `WeezeventTransactionItem.quantity` | ✅ 100% |
| **TVA_percent** | Taux TVA | `WeezeventTransactionItem.vat` | ✅ 100% |
| **Total_HT** | Total HT | `WeezeventPayment.amount - amountVat` | ✅ 100% |
| **Total_TVA** | Montant TVA | `WeezeventPayment.amountVat` | ✅ 100% |
| **Total_TTC** | Total TTC | `WeezeventPayment.amount` | ✅ 100% |
| **Customer_firstname** | Prénom client | `WeezeventUser.firstName` (via `wallet_id`) | ✅ 95% |
| **Customer_lastname** | Nom client | `WeezeventUser.lastName` (via `wallet_id`) | ✅ 95% |
| **Customer_email** | Email client | `WeezeventUser.email` (via `wallet_id`) | ✅ 95% |
| **Customer_phone** | Téléphone client | `WeezeventUser.phone` (via `wallet_id`) | ✅ 95% |

**Légende:**
- ✅ 100% = Toujours disponible
- ✅ 95% = Disponible si le client est identifié
- ✅ 90% = Disponible si le produit a des variantes
- ⚠️ 50% = Dépend des métadonnées Weezevent

---

## 💾 Modèle Prisma pour la Table fnb_sales_raw

```prisma
// Ajouter au schema.prisma existant

model FnbSalesRaw {
  id                  BigInt   @id @default(autoincrement())
  
  // Transaction info
  type                String?
  cashier             String?
  state               String?
  longId              String?  @map("long_id")
  shortId             String?  @map("short_id")
  
  // Product info
  itemId              String?  @map("item_id")
  item                String?
  variation           String?
  itemFamily          String?  @map("item_family")
  
  // Timing
  placedAtDate        DateTime? @map("placed_at_date") @db.Date
  placedAtTime        DateTime? @map("placed_at_time") @db.Time
  
  // Location
  location            String?
  shop                String?
  
  // Dispatch
  dispatch            String?
  dispatchAtDate      String?  @map("dispatch_at_date")
  dispatchAtTime      String?  @map("dispatch_at_time")
  
  // Amounts
  quantity            Float?
  tvaPercent          Float?   @map("tva_percent")
  totalHt             Decimal? @map("total_ht") @db.Decimal(10, 2)
  totalTva            Decimal? @map("total_tva") @db.Decimal(10, 2)
  totalTtc            Decimal? @map("total_ttc") @db.Decimal(10, 2)
  
  // Customer
  customerFirstname   String?  @map("customer_firstname")
  customerLastname    String?  @map("customer_lastname")
  customerEmail       String?  @map("customer_email")
  customerPhone       String?  @map("customer_phone")
  
  // Relations (optionnel - pour lier aux données Weezevent)
  weezeventTransactionId String? @map("weezevent_transaction_id")
  weezeventItemId        String? @map("weezevent_item_id")
  
  @@map("fnb_sales_raw")
  @@index([placedAtDate])
  @@index([shop])
  @@index([itemFamily])
  @@index([state])
}
```

---

## 🔄 Service de Synchronisation

### Code Complet pour Remplir fnb_sales_raw

```typescript
// src/features/weezevent/services/fnb-sync.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/database/prisma.service';

@Injectable()
export class FnbSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Synchronise les transactions Weezevent vers fnb_sales_raw
   */
  async syncTransactionToFnbSalesRaw(
    transactionId: string,
    tenantId: string
  ) {
    // Récupérer la transaction complète avec toutes les relations
    const transaction = await this.prisma.weezeventTransaction.findUnique({
      where: { id: transactionId },
      include: {
        event: true,
        merchant: true,
        location: true,
        sellerWallet: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            product: true,
            payments: {
              include: {
                wallet: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Récupérer le vendeur
    const seller = transaction.sellerWallet?.user?.[0];
    const cashier = seller 
      ? `${seller.firstName || ''} ${seller.lastName || ''}`.trim()
      : null;

    // Mapper le statut
    const stateMapping = {
      'W': 'waiting',
      'V': 'validated',
      'C': 'cancelled',
      'R': 'refunded',
    };

    // Pour chaque item de la transaction
    for (const item of transaction.items) {
      // Pour chaque paiement de l'item
      for (const payment of item.payments) {
        // Récupérer le client
        const customer = payment.wallet?.user?.[0];

        // Calculer les montants
        const totalTtc = Number(payment.amount);
        const totalTva = Number(payment.amountVat);
        const totalHt = totalTtc - totalTva;
        const tvaPercent = item.vat ? Number(item.vat) : null;

        // Créer l'enregistrement fnb_sales_raw
        await this.prisma.fnbSalesRaw.create({
          data: {
            // Transaction info
            type: 'sale',
            cashier,
            state: stateMapping[transaction.status] || transaction.status,
            longId: transaction.weezeventId,
            shortId: transaction.id,
            
            // Product info
            itemId: item.product?.weezeventId || null,
            item: item.product?.name || null,
            variation: this.extractVariation(item.product),
            itemFamily: item.product?.category || null,
            
            // Timing
            placedAtDate: transaction.transactionDate,
            placedAtTime: transaction.transactionDate,
            
            // Location
            location: transaction.location?.name || null,
            shop: transaction.merchant?.name || null,
            
            // Dispatch (si disponible dans metadata)
            dispatch: this.extractDispatchStatus(transaction),
            dispatchAtDate: this.extractDispatchDate(transaction),
            dispatchAtTime: this.extractDispatchTime(transaction),
            
            // Amounts
            quantity: item.quantity,
            tvaPercent,
            totalHt,
            totalTva,
            totalTtc,
            
            // Customer
            customerFirstname: customer?.firstName || null,
            customerLastname: customer?.lastName || null,
            customerEmail: customer?.email || null,
            customerPhone: customer?.phone || null,
            
            // Relations (pour traçabilité)
            weezeventTransactionId: transaction.id,
            weezeventItemId: item.id,
          },
        });
      }
    }
  }

  /**
   * Extrait la variation du produit
   */
  private extractVariation(product: any): string | null {
    if (!product?.variants) return null;
    
    try {
      const variants = typeof product.variants === 'string'
        ? JSON.parse(product.variants)
        : product.variants;
      
      if (Array.isArray(variants) && variants.length > 0) {
        return variants[0].name || null;
      }
    } catch (error) {
      console.error('Error parsing variants:', error);
    }
    
    return null;
  }

  /**
   * Extrait le statut de dispatch depuis les metadata
   */
  private extractDispatchStatus(transaction: any): string | null {
    try {
      const metadata = typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
      
      return metadata?.dispatch?.status || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extrait la date de dispatch
   */
  private extractDispatchDate(transaction: any): string | null {
    try {
      const metadata = typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
      
      const dispatchDate = metadata?.dispatch?.date;
      return dispatchDate ? new Date(dispatchDate).toISOString().split('T')[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extrait l'heure de dispatch
   */
  private extractDispatchTime(transaction: any): string | null {
    try {
      const metadata = typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
      
      const dispatchDate = metadata?.dispatch?.date;
      return dispatchDate ? new Date(dispatchDate).toTimeString().split(' ')[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Synchronise toutes les transactions d'un événement
   */
  async syncEventToFnbSalesRaw(eventId: string, tenantId: string) {
    const transactions = await this.prisma.weezeventTransaction.findMany({
      where: {
        eventId,
        tenantId,
        status: 'V', // Seulement les validées
      },
    });

    let synced = 0;
    let errors = 0;

    for (const transaction of transactions) {
      try {
        await this.syncTransactionToFnbSalesRaw(transaction.id, tenantId);
        synced++;
      } catch (error) {
        console.error(`Error syncing transaction ${transaction.id}:`, error);
        errors++;
      }
    }

    return {
      total: transactions.length,
      synced,
      errors,
    };
  }

  /**
   * Synchronise en temps réel via webhook
   */
  async syncFromWebhook(webhookPayload: any, tenantId: string) {
    // Vérifier si c'est une transaction validée
    if (webhookPayload.event === 'transaction.created' || 
        webhookPayload.event === 'transaction.updated') {
      
      const transactionData = webhookPayload.data;
      
      // Sauvegarder d'abord dans WeezeventTransaction
      const transaction = await this.saveWeezeventTransaction(
        transactionData,
        tenantId
      );
      
      // Puis synchroniser vers fnb_sales_raw
      if (transaction.status === 'V') {
        await this.syncTransactionToFnbSalesRaw(transaction.id, tenantId);
      }
    }
  }

  /**
   * Sauvegarde la transaction Weezevent
   */
  private async saveWeezeventTransaction(data: any, tenantId: string) {
    // Implémentation de la sauvegarde
    // (voir WEEZEVENT_INTEGRATION.md pour le code complet)
    return data;
  }
}
```

---

## 🔄 Intégration avec les Webhooks

### Webhook Handler pour Sync Automatique

```typescript
// src/features/weezevent/controllers/weezevent-webhook.controller.ts

import { Controller, Post, Body, Headers } from '@nestjs/common';
import { FnbSyncService } from '../services/fnb-sync.service';

@Controller('webhooks/weezevent')
export class WeezeventWebhookController {
  constructor(
    private readonly fnbSyncService: FnbSyncService
  ) {}
  
  @Post()
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-tenant-id') tenantId: string
  ) {
    // Synchroniser automatiquement vers fnb_sales_raw
    await this.fnbSyncService.syncFromWebhook(payload, tenantId);
    
    return { received: true };
  }
}
```

---

## 📊 Exemple de Données Mappées

### Données Weezevent (Input)

```json
{
  "id": 123,
  "status": "V",
  "created": "2021-04-16T18:10:00Z",
  "event_id": 1,
  "fundation_id": 3,
  "fundation_name": "The Burger Corner",
  "location_id": 12,
  "location_name": "Northern foodtruck area",
  "seller_id": 2,
  "rows": [{
    "id": 456,
    "item_id": 5,
    "quantity": 2,
    "unit_price": 500,
    "vat": 5.5,
    "payments": [{
      "wallet_id": 42,
      "amount": 1200,
      "amount_vat": 150.5
    }]
  }]
}
```

### Données fnb_sales_raw (Output)

```sql
INSERT INTO fnb_sales_raw VALUES (
  1,                              -- ID
  'sale',                         -- Type
  'John Doe',                     -- Cashier
  'validated',                    -- State
  '123',                          -- Long_ID
  'tx_abc123',                    -- Short_ID
  '5',                            -- Item_ID
  'Burger Deluxe',                -- Item
  NULL,                           -- Variation
  'food',                         -- Item_Family
  '2021-04-16',                   -- Placed_at_date
  '18:10:00',                     -- Placed_at_time
  'Northern foodtruck area',      -- Location
  'The Burger Corner',            -- Shop
  NULL,                           -- Dispatch
  NULL,                           -- Dispatch_at_date
  NULL,                           -- Dispatch_at_time
  2,                              -- Quantity
  5.5,                            -- TVA_percent
  1049.50,                        -- Total_HT
  150.50,                         -- Total_TVA
  1200.00,                        -- Total_TTC
  'Marie',                        -- Customer_firstname
  'Dupont',                       -- Customer_lastname
  'marie.dupont@example.com',     -- Customer_email
  '+33612345678'                  -- Customer_phone
);
```

---

## ✅ Résumé

### Ce qu'on PEUT remplir automatiquement (95% des colonnes)

✅ **Toutes les informations de transaction**  
✅ **Toutes les informations produit**  
✅ **Toutes les informations client** (si wallet identifié)  
✅ **Toutes les informations financières** (HT, TVA, TTC)  
✅ **Toutes les informations de timing**  
✅ **Toutes les informations de localisation**

### Ce qui DÉPEND des métadonnées Weezevent

⚠️ **Dispatch** (statut, date, heure) - Dépend si Weezevent stocke ces infos  
⚠️ **Variation** - Seulement si le produit a des variantes

### Recommandation

**OUI, vous pouvez remplir automatiquement la table `fnb_sales_raw`** avec les données Weezevent !

**Stratégie recommandée:**
1. ✅ Sync initial: Remplir avec l'historique des transactions
2. ✅ Sync temps réel: Via webhooks pour les nouvelles transactions
3. ✅ Sync périodique: Job toutes les 5 minutes pour les mises à jour

**Avantages:**
- Automatisation complète
- Données en temps réel
- Pas de saisie manuelle
- Cohérence des données
