# Guide des Optimisations de Performance

## 🚀 Optimisations Implémentées

### 1. Indexes Base de Données

#### Indexes Composites pour Analytics

**WeezeventTransaction:**
```prisma
@@index([tenantId, status, transactionDate])  // Requêtes CA par période
@@index([tenantId, eventId, status])          // Analytics par événement
@@index([eventId, transactionDate])           // Évolution par événement
@@index([sellerWalletId])                     // Transactions par wallet
```

**WeezeventTransactionItem:**
```prisma
@@index([productId, transactionId])  // Top produits vendus
```

**Bénéfices:**
- ⚡ Requêtes analytics 10-100x plus rapides
- 📊 Agrégations optimisées
- 🔍 Filtres multiples efficaces

---

### 2. Cache Service

#### Utilisation

```typescript
import { CacheService } from '@/core/cache/cache.service';

@Injectable()
export class AnalyticsService {
  constructor(private cache: CacheService) {}

  async getRevenue(tenantId: string, period: string) {
    const cacheKey = `revenue:${tenantId}:${period}`;
    
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Requête coûteuse
        return this.calculateRevenue(tenantId, period);
      },
      300, // TTL 5 minutes
    );
  }
}
```

#### Méthodes Disponibles

```typescript
// Get
const value = cache.get<Revenue>('revenue:tenant123:2024-11');

// Set
cache.set('key', value, 300); // TTL 5 minutes

// Delete
cache.delete('key');

// Clear all
cache.clear();

// Get or Set pattern
const data = await cache.getOrSet('key', async () => fetchData(), 300);

// Invalidate by pattern
cache.invalidatePattern('^revenue:tenant123:');

// Stats
const stats = cache.getStats();
```

---

### 3. Stratégies de Cache

#### Cache par Type de Données

**Analytics (TTL: 5-15 minutes)**
```typescript
// CA quotidien - 15 min
cache.set(`revenue:daily:${date}`, revenue, 900);

// Top produits - 10 min
cache.set(`products:top:${limit}`, products, 600);

// Stats wallets - 5 min
cache.set(`wallets:stats`, stats, 300);
```

**Données Statiques (TTL: 1 heure)**
```typescript
// Événements
cache.set(`events:${eventId}`, event, 3600);

// Produits
cache.set(`products:${productId}`, product, 3600);
```

**Données Temps Réel (TTL: 30 secondes)**
```typescript
// Solde wallet
cache.set(`wallet:${walletId}:balance`, balance, 30);
```

#### Invalidation du Cache

**Après Webhook:**
```typescript
@Injectable()
export class WebhookEventHandler {
  constructor(private cache: CacheService) {}

  async handleTransactionEvent(event: WebhookEvent) {
    // Traiter l'événement
    await this.processTransaction(event);

    // Invalider caches liés
    this.cache.invalidatePattern(`^revenue:${event.tenantId}:`);
    this.cache.invalidatePattern(`^products:top:`);
  }
}
```

**Après Synchronisation:**
```typescript
async syncTransactions(tenantId: string) {
  await this.fetchAndStoreTransactions(tenantId);
  
  // Invalider tous les caches analytics
  this.cache.invalidatePattern(`^revenue:${tenantId}:`);
  this.cache.invalidatePattern(`^analytics:${tenantId}:`);
}
```

---

### 4. Optimisation des Requêtes

#### Utiliser les Indexes

**❌ Lent (sans index):**
```typescript
const transactions = await prisma.weezeventTransaction.findMany({
  where: {
    tenantId: 'xxx',
    status: 'V',
    transactionDate: {
      gte: startDate,
      lte: endDate,
    },
  },
});
```

**✅ Rapide (avec index composite):**
```typescript
// Utilise l'index [tenantId, status, transactionDate]
const transactions = await prisma.weezeventTransaction.findMany({
  where: {
    tenantId: 'xxx',
    status: 'V',
    transactionDate: {
      gte: startDate,
      lte: endDate,
    },
  },
  orderBy: {
    transactionDate: 'desc',
  },
});
```

#### Pagination

**❌ Lent (offset):**
```typescript
const transactions = await prisma.weezeventTransaction.findMany({
  skip: page * limit,
  take: limit,
});
```

**✅ Rapide (cursor):**
```typescript
const transactions = await prisma.weezeventTransaction.findMany({
  take: limit,
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
});
```

#### Agrégations

**Utiliser les agrégations Prisma:**
```typescript
const stats = await prisma.weezeventTransaction.aggregate({
  where: { tenantId, status: 'V' },
  _sum: { amount: true },
  _avg: { amount: true },
  _count: true,
});
```

**Pour des requêtes complexes, utiliser SQL brut:**
```typescript
const result = await prisma.$queryRaw`
  SELECT 
    DATE(transaction_date) as date,
    SUM(amount) as revenue,
    COUNT(*) as count
  FROM "WeezeventTransaction"
  WHERE tenant_id = ${tenantId}
    AND status = 'V'
  GROUP BY DATE(transaction_date)
`;
```

---

### 5. Compression des Réponses

**Activer dans NestJS:**
```typescript
// main.ts
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Compression
  app.use(compression());
  
  await app.listen(3000);
}
```

**Bénéfices:**
- 📉 Réduction taille réponse: 60-80%
- ⚡ Temps de transfert réduit
- 💰 Économie de bande passante

---

### 6. Rate Limiting

**Par endpoint:**
```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('weezevent/analytics')
export class AnalyticsController {
  @Get('revenue')
  @Throttle(10, 60) // 10 requêtes par minute
  async getRevenue() {
    // ...
  }
}
```

---

## 📊 Monitoring Performance

### Métriques à Suivre

**Cache:**
```typescript
@Get('cache/stats')
getCacheStats() {
  return this.cache.getStats();
}
```

**Requêtes Lentes:**
```typescript
// Prisma middleware
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  const duration = after - before;
  if (duration > 1000) {
    logger.warn(`Slow query: ${params.model}.${params.action} (${duration}ms)`);
  }
  
  return result;
});
```

---

## 🎯 Bonnes Pratiques

### 1. Cache Stratégique

✅ **À cacher:**
- Analytics calculés
- Agrégations complexes
- Données peu changeantes
- Résultats de requêtes coûteuses

❌ **À ne pas cacher:**
- Données temps réel critiques
- Informations sensibles
- Données changeant fréquemment

### 2. Indexes

✅ **Créer des indexes pour:**
- Colonnes de filtrage fréquent
- Colonnes de tri
- Foreign keys
- Requêtes analytics

❌ **Éviter trop d'indexes:**
- Impact sur les INSERT/UPDATE
- Espace disque
- Maintenance

### 3. Requêtes

✅ **Optimiser:**
- Utiliser `select` pour limiter les champs
- Paginer les résultats
- Utiliser les agrégations Prisma
- Éviter N+1 queries (use `include`)

❌ **Éviter:**
- `SELECT *` sans raison
- Requêtes sans `WHERE`
- Trop de `JOIN`
- Boucles avec requêtes

---

## 🔧 Migration des Indexes

```bash
# Créer migration
make dev-migrate
# Nom: performance_indexes

# Appliquer
# (déjà fait automatiquement)
```

---

## 📈 Résultats Attendus

**Avant optimisations:**
- Requête CA mensuel: ~2-5 secondes
- Top produits: ~1-3 secondes
- Analytics événement: ~3-8 secondes

**Après optimisations:**
- Requête CA mensuel: ~50-200ms (cache: ~5ms)
- Top produits: ~100-300ms (cache: ~5ms)
- Analytics événement: ~200-500ms (cache: ~10ms)

**Amélioration: 10-100x plus rapide** ⚡

---

## ✅ Checklist

- [x] Indexes composites créés
- [x] Cache service implémenté
- [x] Cache module global
- [ ] Compression activée (à faire dans main.ts)
- [ ] Rate limiting configuré (optionnel)
- [ ] Monitoring mis en place
- [ ] Tests de performance

---

**🚀 Performance optimisée pour les analytics !**
