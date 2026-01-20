# 🚀 Architecture Scalable pour Traitement de Données Haute Performance

**Objectif:** Temps de réponse < 500ms avec gros volumes de données  
**Stack:** NestJS + Fastify + Supabase + Redis  
**Date:** 20 janvier 2026

---

## 📊 Analyse du Projet Actuel

### État des Lieux

| Aspect | État Actuel | Recommandation |
|--------|-------------|----------------|
| **Cache** | In-memory simple | ❌ Redis distribué |
| **DB Queries** | Prisma sync | ⚠️ + Supabase Functions |
| **Sync Data** | Batch séquentiel | ❌ Queue async + Workers |
| **API Response** | Attente complète | ❌ SSE/WebSocket |
| **Aggregations** | Calcul à la volée | ❌ Pre-compute + Materialized Views |

### Points Forts Existants ✅
- Architecture multi-tenant bien conçue
- Séparation core/features/shared claire
- Intégration Weezevent fonctionnelle
- Index Prisma bien définis
- RLS Supabase configuré

### Goulots d'Étranglement Identifiés ❌
1. Cache in-memory non persistant et non distribué
2. Sync Weezevent séquentiel (boucle page par page)
3. Pas de queue pour traitement asynchrone
4. Calculs analytics à chaque requête
5. Pas de CDN/Edge computing

---

## 🏗️ Architecture Scalable Proposée

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EDGE LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Cloudflare │  │   Vercel    │  │    CDN      │  │  Rate Limit │        │
│  │    WAF      │  │    Edge     │  │   Cache     │  │   @ Edge    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (NestJS + Fastify)                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Auth      │  │  Rate Limit │  │  Response   │  │  Request    │  │   │
│  │  │   Guard     │  │    Guard    │  │   Cache     │  │  Validation │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │      SYNC ENDPOINTS         │  │         ASYNC ENDPOINTS             │   │
│  │  (Lecture rapide < 100ms)   │  │      (Retour immédiat + Queue)      │   │
│  │  - GET /analytics/summary   │  │  - POST /sync/weezevent             │   │
│  │  - GET /spaces/:id          │  │  - POST /reports/generate           │   │
│  │  - GET /events/list         │  │  - POST /exports/large-dataset      │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┴────────────────────────────────┐
        │                                                              │
        ▼                                                              ▼
┌───────────────────────────────┐                    ┌───────────────────────────────┐
│         CACHE LAYER           │                    │         QUEUE LAYER            │
│  ┌─────────────────────────┐  │                    │  ┌─────────────────────────┐   │
│  │     Redis Cluster       │  │                    │  │    BullMQ (Redis)       │   │
│  │  - Response Cache       │  │                    │  │  - weezevent-sync       │   │
│  │  - Session Cache        │  │                    │  │  - report-generation    │   │
│  │  - Rate Limit Store     │  │                    │  │  - data-aggregation     │   │
│  │  - Real-time Pub/Sub    │  │                    │  │  - notification-send    │   │
│  └─────────────────────────┘  │                    │  └─────────────────────────┘   │
│  TTL: 60s - 3600s             │                    │  Workers: 4-16 per queue       │
└───────────────────────────────┘                    └───────────────────────────────┘
        │                                                              │
        │         ┌────────────────────────────────────────────────────┘
        │         │
        ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE LAYER                                       │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │     PostgreSQL Primary      │  │       Edge Functions (Deno)          │   │
│  │  - OLTP Transactions        │  │  - Heavy Aggregations                │   │
│  │  - Real-time Subscriptions  │  │  - Data Transformations              │   │
│  │  - RLS Security             │  │  - Webhook Processing                │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │    Materialized Views       │  │          PG Functions                │   │
│  │  - Analytics Pre-computed   │  │  - Batch Operations                  │   │
│  │  - Dashboard Metrics        │  │  - Complex Aggregations              │   │
│  │  - Refresh: 5-15 min        │  │  - Trigger-based Updates             │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │       Storage (S3)          │  │         Realtime                     │   │
│  │  - Reports PDF/Excel        │  │  - WebSocket Channels                │   │
│  │  - Large Exports            │  │  - Broadcast Notifications           │   │
│  │  - Async File Generation    │  │  - Progress Updates                  │   │
│  └─────────────────────────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implémentation Détaillée

### 1. Cache Distribué avec Redis

```typescript
// src/core/cache/redis-cache.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisCacheService {
  private readonly redis: Redis;
  private readonly cluster: Redis.Cluster;

  constructor(private config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  /**
   * Cache-Aside Pattern avec TTL dynamique
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: { ttl: number; tags?: string[] }
  ): Promise<T> {
    // Check cache
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Cache miss - compute value
    const value = await factory();
    
    // Store with TTL
    await this.redis.setex(key, options.ttl, JSON.stringify(value));
    
    // Store tags for invalidation
    if (options.tags) {
      for (const tag of options.tags) {
        await this.redis.sadd(`tag:${tag}`, key);
      }
    }

    return value;
  }

  /**
   * Invalidation par tag (ex: tout un tenant)
   */
  async invalidateByTag(tag: string): Promise<void> {
    const keys = await this.redis.smembers(`tag:${tag}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      await this.redis.del(`tag:${tag}`);
    }
  }

  /**
   * Cache pour analytics pré-calculées
   */
  async cacheAnalytics(tenantId: string, metrics: DashboardMetrics): Promise<void> {
    const key = `analytics:${tenantId}:dashboard`;
    await this.redis.setex(key, 300, JSON.stringify(metrics)); // 5 min TTL
  }
}
```

### 2. Queue System avec BullMQ

```typescript
// src/core/queue/queue.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    BullModule.registerQueue(
      { name: 'weezevent-sync' },
      { name: 'analytics-compute' },
      { name: 'reports-generation' },
      { name: 'notifications' },
    ),
  ],
})
export class QueueModule {}

// src/features/weezevent/processors/sync.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('weezevent-sync', {
  concurrency: 4, // 4 workers parallèles
  limiter: {
    max: 10,
    duration: 1000, // Max 10 jobs/sec (rate limit API)
  },
})
export class WeezeventSyncProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private weezeventClient: WeezeventClientService,
    private cache: RedisCacheService,
    private realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<SyncResult> {
    const { tenantId, syncType, options } = job.data;

    // Notify start via WebSocket
    await this.realtime.broadcast(tenantId, 'sync:started', { syncType });

    try {
      let result: SyncResult;

      switch (syncType) {
        case 'transactions':
          result = await this.syncTransactions(tenantId, options, job);
          break;
        case 'products':
          result = await this.syncProducts(tenantId, options, job);
          break;
        // ... autres types
      }

      // Invalidate related caches
      await this.cache.invalidateByTag(`tenant:${tenantId}`);
      
      // Notify completion
      await this.realtime.broadcast(tenantId, 'sync:completed', result);

      return result;
    } catch (error) {
      await this.realtime.broadcast(tenantId, 'sync:error', { 
        message: error.message 
      });
      throw error;
    }
  }

  private async syncTransactions(
    tenantId: string,
    options: SyncOptions,
    job: Job,
  ): Promise<SyncResult> {
    const result = { synced: 0, created: 0, updated: 0 };
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Fetch page from API
      const response = await this.weezeventClient.getTransactions(
        tenantId,
        options.organizationId,
        { page, perPage: 100 }
      );

      // Bulk upsert avec Prisma (plus performant)
      await this.prisma.$transaction(async (tx) => {
        for (const transaction of response.data) {
          await tx.weezeventTransaction.upsert({
            where: { weezeventId: transaction.id.toString() },
            update: this.mapTransaction(transaction, tenantId),
            create: this.mapTransaction(transaction, tenantId),
          });
        }
      });

      result.synced += response.data.length;
      
      // Update job progress (visible en temps réel)
      await job.updateProgress({
        current: result.synced,
        total: response.meta.total,
        percentage: Math.round((result.synced / response.meta.total) * 100),
      });

      hasMore = page < response.meta.total_pages;
      page++;
    }

    return result;
  }
}
```

### 3. Materialized Views Supabase

```sql
-- supabase/migrations/20260120_materialized_views.sql

-- Vue matérialisée pour dashboard analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_analytics AS
SELECT 
    t."tenantId",
    DATE_TRUNC('day', t."transactionDate") as transaction_date,
    COUNT(*) as transaction_count,
    SUM(t.amount) as total_amount,
    AVG(t.amount) as avg_amount,
    COUNT(DISTINCT t."merchantId") as unique_merchants,
    COUNT(DISTINCT t."locationId") as unique_locations,
    jsonb_build_object(
        'by_status', (
            SELECT jsonb_object_agg(status, cnt)
            FROM (
                SELECT status, COUNT(*) as cnt
                FROM "WeezeventTransaction" wt
                WHERE wt."tenantId" = t."tenantId"
                GROUP BY status
            ) status_counts
        ),
        'by_merchant', (
            SELECT jsonb_agg(jsonb_build_object(
                'merchantId', "merchantId",
                'merchantName', "merchantName",
                'total', SUM(amount)
            ))
            FROM "WeezeventTransaction" wt
            WHERE wt."tenantId" = t."tenantId"
            GROUP BY "merchantId", "merchantName"
            ORDER BY SUM(amount) DESC
            LIMIT 10
        )
    ) as breakdown
FROM "WeezeventTransaction" t
GROUP BY t."tenantId", DATE_TRUNC('day', t."transactionDate")
WITH DATA;

-- Index pour accès rapide
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_analytics_pk 
ON mv_tenant_analytics ("tenantId", transaction_date);

-- Vue pour métriques temps réel (dernières 24h)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_realtime_metrics AS
SELECT 
    "tenantId",
    COUNT(*) as transactions_24h,
    SUM(amount) as revenue_24h,
    AVG(amount) as avg_basket_24h,
    COUNT(DISTINCT "merchantId") as active_merchants_24h
FROM "WeezeventTransaction"
WHERE "transactionDate" >= NOW() - INTERVAL '24 hours'
  AND status = 'completed'
GROUP BY "tenantId"
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_realtime_pk 
ON mv_realtime_metrics ("tenantId");

-- Fonction pour rafraîchir les vues
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_analytics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_realtime_metrics;
END;
$$ LANGUAGE plpgsql;

-- Job de rafraîchissement automatique (via pg_cron)
-- SELECT cron.schedule('refresh-analytics', '*/5 * * * *', 'SELECT refresh_analytics_views()');
```

### 4. Edge Functions pour Calculs Lourds

```typescript
// supabase/functions/compute-analytics/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { tenantId, dateRange, metrics } = await req.json();
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Exécution de requêtes complexes côté DB
  const { data, error } = await supabase.rpc('compute_tenant_analytics', {
    p_tenant_id: tenantId,
    p_start_date: dateRange.start,
    p_end_date: dateRange.end,
    p_metrics: metrics,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // Cache 5 min
    },
  });
});
```

### 5. Pattern Request/Response Optimisé

```typescript
// src/features/analytics/analytics.controller.ts
import { Controller, Get, Post, Body, Sse } from '@nestjs/common';
import { Observable, interval, map, takeUntil, Subject } from 'rxjs';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(
    private cache: RedisCacheService,
    private analyticsService: AnalyticsService,
    private syncQueue: Queue,
  ) {}

  /**
   * ENDPOINT SYNCHRONE RAPIDE (< 100ms)
   * Utilise cache + materialized views
   */
  @Get('dashboard')
  async getDashboard(@CurrentTenant() tenantId: string) {
    // 1. Check cache first (< 5ms)
    const cacheKey = `dashboard:${tenantId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // 2. Query materialized view (< 50ms)
    const metrics = await this.analyticsService.getDashboardFromView(tenantId);

    // 3. Cache for next requests
    await this.cache.set(cacheKey, metrics, { ttl: 60, tags: [`tenant:${tenantId}`] });

    return metrics;
  }

  /**
   * ENDPOINT ASYNCHRONE (retour immédiat)
   * Lance un job et retourne un ID de tracking
   */
  @Post('sync/full')
  async startFullSync(
    @CurrentTenant() tenantId: string,
    @Body() options: SyncOptionsDto,
  ) {
    // Add job to queue (< 10ms)
    const job = await this.syncQueue.add('full-sync', {
      tenantId,
      options,
    }, {
      priority: 1,
      jobId: `sync-${tenantId}-${Date.now()}`,
    });

    // Return immediately with tracking info
    return {
      jobId: job.id,
      status: 'queued',
      trackingUrl: `/api/v1/jobs/${job.id}/status`,
      estimatedDuration: '30-60 seconds',
    };
  }

  /**
   * SERVER-SENT EVENTS pour progression temps réel
   */
  @Sse('sync/progress/:jobId')
  streamSyncProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const stop$ = new Subject<void>();

    return interval(1000).pipe(
      takeUntil(stop$),
      map(async () => {
        const job = await this.syncQueue.getJob(jobId);
        
        if (!job) {
          stop$.next();
          return { data: { status: 'not_found' } };
        }

        const state = await job.getState();
        const progress = job.progress;

        if (state === 'completed' || state === 'failed') {
          stop$.next();
        }

        return {
          data: {
            status: state,
            progress,
            result: state === 'completed' ? await job.returnvalue : null,
            error: state === 'failed' ? job.failedReason : null,
          },
        };
      }),
    );
  }

  /**
   * WebSocket pour notifications temps réel
   */
  @WebSocketGateway({ namespace: 'analytics' })
  export class AnalyticsGateway {
    @SubscribeMessage('subscribe')
    handleSubscription(
      @ConnectedSocket() client: Socket,
      @MessageBody() data: { tenantId: string },
    ) {
      client.join(`tenant:${data.tenantId}`);
      return { event: 'subscribed', data: { room: data.tenantId } };
    }
  }
}
```

---

## 📈 Patterns pour < 500ms de Latence

### Pattern 1: CQRS (Command Query Responsibility Segregation)

```
┌─────────────────────────────────────────────────────────────────┐
│                         COMMANDS (Write)                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Controller │───▶│    Queue    │───▶│   Worker    │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                               │                  │
│                                               ▼                  │
│                                        ┌─────────────┐          │
│                                        │  Database   │          │
│                                        └──────┬──────┘          │
│                                               │                  │
│                                               ▼                  │
│                                        ┌─────────────┐          │
│                                        │   Refresh   │          │
│                                        │    Views    │          │
│                                        └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         QUERIES (Read)                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Controller │───▶│    Cache    │───▶│    Views    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                  │                    │                 │
│        │    < 5ms         │    < 50ms         │                 │
│        ◀──────────────────┴────────────────────                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern 2: Optimistic UI + Background Sync

```typescript
// Le frontend reçoit une réponse immédiate optimiste
// Le backend traite en background et notifie via WebSocket

// Controller
@Post('transactions')
async createTransaction(@Body() dto: CreateTransactionDto) {
  // 1. Validation rapide (< 10ms)
  await this.validateTransaction(dto);
  
  // 2. Créer entrée avec status 'pending'
  const transaction = await this.prisma.transaction.create({
    data: { ...dto, status: 'pending' },
  });
  
  // 3. Queue le traitement complet
  await this.queue.add('process-transaction', { id: transaction.id });
  
  // 4. Retour immédiat (< 50ms total)
  return {
    id: transaction.id,
    status: 'pending',
    message: 'Transaction en cours de traitement',
  };
}
```

### Pattern 3: Stale-While-Revalidate

```typescript
async getAnalytics(tenantId: string) {
  const cacheKey = `analytics:${tenantId}`;
  
  // Always return cached data immediately if available
  const cached = await this.cache.get(cacheKey);
  
  // Check if cache needs refresh
  const needsRefresh = await this.cache.isStale(cacheKey);
  
  if (needsRefresh) {
    // Refresh in background (don't await)
    this.refreshAnalyticsInBackground(tenantId, cacheKey);
  }
  
  if (cached) {
    return { data: cached, stale: needsRefresh };
  }
  
  // Cache miss - must wait
  const fresh = await this.computeAnalytics(tenantId);
  await this.cache.set(cacheKey, fresh, { ttl: 300 });
  return { data: fresh, stale: false };
}
```

---

## 🔄 Stratégie de Synchronisation Weezevent Optimisée

### Sync Incrémentale avec Curseurs

```typescript
// Remplacer la pagination classique par des curseurs
async syncTransactionsIncremental(tenantId: string) {
  // 1. Récupérer le dernier état de sync
  const syncState = await this.prisma.weezeventSyncState.findUnique({
    where: { tenantId_syncType: { tenantId, syncType: 'transactions' } },
  });
  
  const lastSyncedAt = syncState?.lastSyncedAt || new Date(0);
  
  // 2. Ne récupérer que les nouvelles/modifiées
  const response = await this.weezeventClient.getTransactions(tenantId, {
    updated_since: lastSyncedAt.toISOString(),
    sort: 'updated_at:asc',
    per_page: 500,
  });
  
  // 3. Upsert en batch avec Prisma
  await this.prisma.$transaction(
    response.data.map(tx =>
      this.prisma.weezeventTransaction.upsert({
        where: { weezeventId: tx.id.toString() },
        update: this.mapTransaction(tx),
        create: this.mapTransaction(tx),
      })
    )
  );
  
  // 4. Mettre à jour l'état
  await this.prisma.weezeventSyncState.upsert({
    where: { tenantId_syncType: { tenantId, syncType: 'transactions' } },
    update: { 
      lastSyncedAt: new Date(),
      lastCursor: response.meta.next_cursor,
    },
    create: { 
      tenantId, 
      syncType: 'transactions',
      lastSyncedAt: new Date(),
    },
  });
}
```

### Webhook Processing avec Deduplication

```typescript
@Processor('webhooks')
export class WebhookProcessor extends WorkerHost {
  async process(job: Job<WebhookJobData>) {
    const { tenantId, eventType, payload, signature } = job.data;
    
    // 1. Idempotency check (éviter doublons)
    const eventHash = this.computeHash(payload);
    const isDuplicate = await this.cache.has(`webhook:${eventHash}`);
    
    if (isDuplicate) {
      return { skipped: true, reason: 'duplicate' };
    }
    
    // 2. Mark as processing
    await this.cache.set(`webhook:${eventHash}`, true, { ttl: 3600 });
    
    // 3. Process based on type
    switch (eventType) {
      case 'transaction.created':
        await this.handleNewTransaction(tenantId, payload);
        break;
      case 'transaction.updated':
        await this.handleUpdatedTransaction(tenantId, payload);
        break;
    }
    
    // 4. Invalidate related caches
    await this.cache.invalidateByTag(`tenant:${tenantId}:transactions`);
  }
}
```

---

## 📊 Configuration Redis Recommandée

```yaml
# docker-compose.production.yml
services:
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  # Pour Supabase Realtime alternatif
  redis-pubsub:
    image: redis:7-alpine
    command: redis-server --appendonly no
    deploy:
      resources:
        limits:
          memory: 256M
```

---

## 📋 Checklist d'Implémentation

### Phase 1 - Cache Distribué (Semaine 1)
- [ ] Installer Redis et configurer la connexion
- [ ] Migrer CacheService vers RedisCacheService
- [ ] Implémenter cache tags pour invalidation
- [ ] Ajouter cache aux endpoints critiques

### Phase 2 - Queue System (Semaine 2)
- [ ] Configurer BullMQ avec Redis
- [ ] Créer processors pour sync Weezevent
- [ ] Implémenter job progress tracking
- [ ] Ajouter retry logic et dead letter queue

### Phase 3 - Materialized Views (Semaine 3)
- [ ] Créer migrations pour vues matérialisées
- [ ] Configurer refresh automatique (pg_cron)
- [ ] Optimiser queries pour utiliser les vues
- [ ] Benchmarker les performances

### Phase 4 - Realtime (Semaine 4)
- [ ] Configurer WebSocket Gateway NestJS
- [ ] Implémenter Server-Sent Events
- [ ] Intégrer Supabase Realtime
- [ ] Frontend: écouter les updates

### Phase 5 - Edge Computing (Semaine 5)
- [ ] Déployer Edge Functions Supabase
- [ ] Configurer CDN Cloudflare
- [ ] Implémenter rate limiting @edge
- [ ] Optimiser pour cold starts

---

## 🎯 Métriques de Succès

| Métrique | Avant | Objectif | 
|----------|-------|----------|
| Latence P50 | ~800ms | < 100ms |
| Latence P95 | ~2s | < 300ms |
| Latence P99 | ~5s | < 500ms |
| Sync Full | 30 min | < 5 min |
| Cache Hit Rate | 0% | > 80% |
| Concurrent Users | 50 | 500+ |

---

## 🔗 Ressources

- [NestJS Bull Module](https://docs.nestjs.com/techniques/queues)
- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [PostgreSQL Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [CQRS Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs)
