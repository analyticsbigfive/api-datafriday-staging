# Weezevent API Client - Usage Guide

## Installation

Le module Weezevent est déjà installé et configuré dans votre application.

## Configuration

Les credentials Weezevent sont configurés par tenant via les endpoints d'onboarding.

## Utilisation dans vos Services

### Injection du Service

```typescript
import { Injectable } from '@nestjs/common';
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';

@Injectable()
export class YourService {
  constructor(
    private readonly weezeventClient: WeezeventClientService,
  ) {}
}
```

### Exemples d'Utilisation

#### 1. Récupérer les Transactions

```typescript
async getRecentTransactions(tenantId: string, organizationId: string) {
  try {
    const result = await this.weezeventClient.getTransactions(
      tenantId,
      organizationId,
      {
        page: 1,
        perPage: 50,
        status: 'V', // Validated only
        fromDate: new Date('2024-01-01'),
        toDate: new Date(),
      },
    );

    console.log(`Found ${result.meta.total} transactions`);
    console.log(`Page ${result.meta.current_page} of ${result.meta.total_pages}`);
    
    return result.data;
  } catch (error) {
    if (error instanceof WeezeventAuthException) {
      console.error('Authentication failed:', error.message);
    } else if (error instanceof WeezeventApiException) {
      console.error('API error:', error.message);
    }
    throw error;
  }
}
```

#### 2. Récupérer une Transaction Spécifique

```typescript
async getTransactionDetails(
  tenantId: string,
  organizationId: string,
  transactionId: string,
) {
  const transaction = await this.weezeventClient.getTransaction(
    tenantId,
    organizationId,
    transactionId,
  );

  console.log(`Transaction ${transaction.id}:`);
  console.log(`- Event: ${transaction.event_name}`);
  console.log(`- Merchant: ${transaction.fundation_name}`);
  console.log(`- Status: ${transaction.status}`);
  console.log(`- Items: ${transaction.rows.length}`);

  return transaction;
}
```

#### 3. Récupérer les Informations Client

```typescript
async getClientInfo(
  tenantId: string,
  organizationId: string,
  walletId: string,
) {
  // Get wallet
  const wallet = await this.weezeventClient.getWallet(
    tenantId,
    organizationId,
    walletId,
  );

  // Get user details
  const user = await this.weezeventClient.getUser(
    tenantId,
    organizationId,
    wallet.user_id.toString(),
  );

  return {
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
      cardNumber: wallet.metadata?.card_number,
    },
    user: {
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      phone: user.phone,
      address: user.address,
    },
  };
}
```

#### 4. Récupérer les Événements

```typescript
async listEvents(tenantId: string, organizationId: string) {
  const result = await this.weezeventClient.getEvents(
    tenantId,
    organizationId,
    { page: 1, perPage: 20 },
  );

  return result.data.map(event => ({
    id: event.id,
    name: event.name,
    startDate: new Date(event.start_date),
    endDate: new Date(event.end_date),
    status: event.status,
  }));
}
```

#### 5. Récupérer les Produits

```typescript
async getProductCatalog(
  tenantId: string,
  organizationId: string,
  category?: string,
) {
  const result = await this.weezeventClient.getProducts(
    tenantId,
    organizationId,
    { category, perPage: 100 },
  );

  return result.data.map(product => ({
    id: product.id,
    name: product.name,
    price: product.base_price,
    category: product.category,
    allergens: product.allergens,
  }));
}
```

## Gestion des Erreurs

### Types d'Exceptions

```typescript
import { 
  WeezeventAuthException,
  WeezeventApiException,
} from '../weezevent/exceptions';

try {
  const transactions = await this.weezeventClient.getTransactions(...);
} catch (error) {
  if (error instanceof WeezeventAuthException) {
    // Problème d'authentification
    // - Credentials invalides
    // - Token expiré
    // - Weezevent non configuré
    console.error('Auth error:', error.message);
  } else if (error instanceof WeezeventApiException) {
    // Erreur API
    // - Resource not found (404)
    // - Rate limit (429)
    // - Server error (5xx)
    console.error('API error:', error.message);
    console.error('Original error:', error.originalError);
  }
}
```

### Retry Automatique

Le client API implémente automatiquement un retry avec exponential backoff pour :
- ✅ Erreurs réseau
- ✅ Erreurs serveur (5xx)
- ✅ Rate limiting (429)

**Configuration :**
- Max retries: 3
- Delay initial: 1000ms
- Backoff: exponentiel (1s, 2s, 4s)

## Pagination

Toutes les méthodes de liste retournent un objet paginé :

```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}
```

### Exemple de Pagination

```typescript
async getAllTransactions(tenantId: string, organizationId: string) {
  const allTransactions = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await this.weezeventClient.getTransactions(
      tenantId,
      organizationId,
      { page: currentPage, perPage: 100 },
    );

    allTransactions.push(...result.data);

    hasMore = currentPage < result.meta.total_pages;
    currentPage++;
  }

  return allTransactions;
}
```

## Logging

Le client API utilise le Logger de NestJS. Pour activer les logs debug :

```typescript
// Dans votre .env
LOG_LEVEL=debug
```

Logs disponibles :
- `debug` - Détails des requêtes HTTP
- `log` - Authentification et opérations importantes
- `warn` - Retries et avertissements
- `error` - Erreurs API et réseau

## Performance

### Token Caching

Les tokens OAuth sont automatiquement cachés par tenant avec un buffer de 60 secondes avant expiration.

### Optimisations

```typescript
// ❌ Mauvais - Plusieurs appels pour la même transaction
const transaction = await this.weezeventClient.getTransaction(...);
const wallet = await this.weezeventClient.getWallet(..., transaction.seller_wallet_id);
const user = await this.weezeventClient.getUser(..., wallet.user_id);

// ✅ Bon - Utiliser les données déjà présentes
const transaction = await this.weezeventClient.getTransaction(...);
// transaction.rows[0].payments[0].wallet_id contient déjà l'info
```
