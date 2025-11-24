# Mapping des Données Weezevent - Relations et Endpoints

## 📊 Structure de la Transaction

Voici tous les éléments récupérables à partir de la réponse transaction:

```json
{
  "application_id": 45,           // ✅ Application
  "event_id": 1,                  // ✅ Event
  "fundation_id": 3,              // ✅ Fundation (Merchant)
  "location_id": 12,              // ✅ Location
  "seller_id": 2,                 // ✅ User (Seller)
  "seller_wallet_id": 18,         // ✅ Wallet
  "rows": [
    {
      "item_id": 5,               // ✅ Product
      "compound_id": 124,         // ✅ Product (composé)
      "payments": [
        {
          "wallet_id": 42,        // ✅ Wallet (acheteur)
          "balance_id": 24,       // ⚠️ Balance (interne)
          "currency_id": 1,       // ✅ Currency
          "payment_method_id": 4, // ✅ Payment Method
          "invoice_id": 11        // ⚠️ Invoice (peut-être disponible)
        }
      ]
    }
  ]
}
```

---

## 🔗 Entités Récupérables via API

### 1. **Event** (`event_id: 1`)

**Endpoint:** `GET /organizations/{organization_id}/events/{event_id}`

**Données récupérables:**
```json
{
  "id": 1,
  "name": "MusicFest",
  "organization_id": 102045,
  "start_date": "2021-04-16T00:00:00Z",
  "end_date": "2021-04-18T23:59:59Z",
  "description": "...",
  "location": "...",
  "capacity": 5000,
  "status": "active",
  "metadata": {...}
}
```

**Utilité:**
- Nom de l'événement
- Dates de l'événement
- Capacité
- Localisation de l'événement
- Métadonnées

---

### 2. **Fundation/Merchant** (`fundation_id: 3`)

**Endpoint:** `GET /organizations/{organization_id}/fundations/{fundation_id}`

**Données récupérables:**
```json
{
  "id": 3,
  "name": "The Burger Corner",
  "organization_id": 102045,
  "description": "...",
  "contact": {
    "email": "...",
    "phone": "..."
  },
  "address": {...},
  "metadata": {...}
}
```

**Utilité:**
- Informations du marchand
- Coordonnées
- Adresse
- Métadonnées

---

### 3. **Location** (`location_id: 12`)

**Endpoint:** `GET /organizations/{organization_id}/locations/{location_id}`

**Données récupérables:**
```json
{
  "id": 12,
  "name": "Northern foodtruck area",
  "event_id": 1,
  "type": "foodtruck_area",
  "capacity": 100,
  "coordinates": {
    "x": 123.45,
    "y": 67.89
  },
  "metadata": {...}
}
```

**Utilité:**
- Nom de l'emplacement
- Type d'emplacement
- Capacité
- Coordonnées géographiques
- Lien avec l'événement

---

### 4. **Product/Item** (`item_id: 5`)

**Endpoint:** `GET /organizations/{organization_id}/products/{product_id}`

**Données récupérables:**
```json
{
  "id": 5,
  "name": "Burger Deluxe",
  "description": "...",
  "category": "food",
  "base_price": 500,
  "vat_rate": 5.5,
  "image": "...",
  "allergens": ["gluten", "dairy"],
  "components": [...],
  "variants": [...],
  "metadata": {...}
}
```

**Utilité:**
- Nom du produit
- Description
- Catégorie
- Prix de base
- Taux de TVA
- Image
- Allergènes
- Composants (pour les produits composés)
- Variantes

---

### 5. **Product Composé** (`compound_id: 124`)

**Endpoint:** `GET /organizations/{organization_id}/products/{compound_id}`

**Données récupérables:**
- Même structure que Product
- Liste des composants
- Recette
- Coûts de production

---

### 6. **Wallet (Vendeur)** (`seller_wallet_id: 18`)

**Endpoint:** `GET /organizations/{organization_id}/wallets/{wallet_id}`

**Données récupérables:**
```json
{
  "id": 18,
  "balance": 15000,
  "currency_id": 1,
  "user_id": 2,
  "wallet_group_id": 5,
  "status": "active",
  "created_at": "...",
  "updated_at": "...",
  "metadata": {...}
}
```

**Utilité:**
- Solde actuel
- Devise
- Utilisateur associé
- Groupe de wallet
- Statut
- Historique

---

### 7. **Wallet (Acheteur)** (`wallet_id: 42`)

**Endpoint:** `GET /organizations/{organization_id}/wallets/{wallet_id}`

**Données récupérables:**
- Même structure que Wallet vendeur
- Solde de l'acheteur
- Historique des transactions

---

### 8. **Currency** (`currency_id: 1`)

**Endpoint:** `GET /organizations/{organization_id}/currencies/{currency_id}`

**Données récupérables:**
```json
{
  "id": 1,
  "code": "EUR",
  "name": "Euro",
  "symbol": "€",
  "exchange_rate": 1.0,
  "is_default": true,
  "metadata": {...}
}
```

**Utilité:**
- Code de la devise
- Nom
- Symbole
- Taux de change
- Devise par défaut

---

### 9. **Payment Method** (`payment_method_id: 4`)

**Endpoint:** `GET /organizations/{organization_id}/payment-methods/{payment_method_id}`

**Données récupérables:**
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
  "metadata": {...}
}
```

**Utilité:**
- Nom de la méthode de paiement
- Type (carte, espèces, wallet, etc.)
- Statut actif/inactif
- Frais associés

---

### 10. **User (Seller)** (`seller_id: 2`)

**Endpoint:** `GET /organizations/{organization_id}/users/{user_id}`

**Données récupérables:**
```json
{
  "id": 2,
  "email": "seller@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "seller",
  "permissions": [...],
  "wallet_id": 18,
  "created_at": "...",
  "metadata": {...}
}
```

**Utilité:**
- Informations du vendeur
- Email
- Nom complet
- Rôle
- Permissions
- Wallet associé

---

## 📈 Données Enrichies Possibles

### Avec ces IDs, vous pouvez construire:

#### 1. **Vue Complète de la Transaction**
```typescript
interface EnrichedTransaction {
  // Transaction de base
  transaction: Transaction;
  
  // Données enrichies
  event: Event;
  merchant: Fundation;
  location: Location;
  seller: User;
  sellerWallet: Wallet;
  
  // Items détaillés
  items: Array<{
    product: Product;
    compound?: Product;
    quantity: number;
    unitPrice: number;
    vat: number;
    
    // Paiements détaillés
    payments: Array<{
      wallet: Wallet;
      currency: Currency;
      paymentMethod: PaymentMethod;
      amount: number;
    }>;
  }>;
}
```

#### 2. **Analytics par Event**
- Total des ventes par événement
- Produits les plus vendus
- Revenus par emplacement
- Performance des vendeurs

#### 3. **Analytics par Merchant**
- Chiffre d'affaires total
- Produits populaires
- Taux de conversion
- Revenus par événement

#### 4. **Analytics par Location**
- Revenus par zone
- Affluence
- Produits vendus par zone

#### 5. **Analytics par Product**
- Quantités vendues
- Revenus générés
- Popularité par événement
- Popularité par emplacement

---

## 🔄 Stratégie de Synchronisation

### Données à Synchroniser en Priorité

**Niveau 1 - Référentiels (Sync initial + mise à jour périodique)**
```
Events → Fundations → Locations → Products → Currencies → Payment Methods
```

**Niveau 2 - Données Transactionnelles (Sync temps réel via webhooks)**
```
Transactions → Wallets (mise à jour solde)
```

**Niveau 3 - Données Utilisateurs (Sync à la demande)**
```
Users → Wallets
```

### Ordre de Synchronisation Recommandé

```typescript
// 1. Sync initial des référentiels
async function syncReferentials(organizationId: string) {
  await syncEvents(organizationId);
  await syncFundations(organizationId);
  await syncLocations(organizationId);
  await syncProducts(organizationId);
  await syncCurrencies(organizationId);
  await syncPaymentMethods(organizationId);
}

// 2. Sync des transactions (avec enrichissement)
async function syncTransactions(organizationId: string) {
  const transactions = await getTransactions(organizationId);
  
  for (const transaction of transactions) {
    // Enrichir avec les données référentielles
    const enriched = await enrichTransaction(transaction);
    
    // Sauvegarder
    await saveEnrichedTransaction(enriched);
  }
}

// 3. Webhooks pour les mises à jour temps réel
async function handleTransactionWebhook(payload: WebhookPayload) {
  const transaction = payload.transaction;
  
  // Enrichir
  const enriched = await enrichTransaction(transaction);
  
  // Sauvegarder
  await saveEnrichedTransaction(enriched);
  
  // Mettre à jour les wallets
  await updateWalletBalances(transaction);
}
```

---

## 🎯 Résumé

### Données Récupérables

| ID dans Transaction | Entité | Endpoint | Priorité |
|---------------------|--------|----------|----------|
| `event_id` | Event | `/events/{id}` | 🔴 Haute |
| `fundation_id` | Merchant | `/fundations/{id}` | 🔴 Haute |
| `location_id` | Location | `/locations/{id}` | 🟡 Moyenne |
| `seller_id` | User | `/users/{id}` | 🟡 Moyenne |
| `seller_wallet_id` | Wallet | `/wallets/{id}` | 🔴 Haute |
| `item_id` | Product | `/products/{id}` | 🔴 Haute |
| `compound_id` | Product | `/products/{id}` | 🟡 Moyenne |
| `wallet_id` | Wallet | `/wallets/{id}` | 🔴 Haute |
| `currency_id` | Currency | `/currencies/{id}` | 🟢 Basse |
| `payment_method_id` | Payment Method | `/payment-methods/{id}` | 🟢 Basse |

### Recommandations

1. **Sync initial** des référentiels (Events, Merchants, Products, etc.)
2. **Webhooks** pour les transactions en temps réel
3. **Enrichissement** automatique des transactions avec les données référentielles
4. **Cache** des données référentielles pour performance
5. **Analytics** basés sur les données enrichies
