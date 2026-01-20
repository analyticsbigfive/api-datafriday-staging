# 🎭 Architecture Hybride NestJS + Supabase Edge Functions

**Objectif:** NestJS comme chef d'orchestre + Supabase pour les calculs lourds  
**Résultat:** Latence < 500ms, scalabilité maximale, coûts optimisés

---

## 🤔 Le Dilemme : NestJS vs Edge Functions

### Option 1: Tout dans NestJS ❌
```
Client → NestJS → PostgreSQL → NestJS → Client
         │
         └── Problèmes:
             • CPU bound pour gros calculs
             • Scaling vertical coûteux
             • Latence élevée pour aggregations
```

### Option 2: Tout dans Edge Functions ❌
```
Client → Edge Functions → PostgreSQL → Edge Functions → Client
         │
         └── Problèmes:
             • Pas de state management
             • Cold starts (100-500ms)
             • Limites de temps (30s max)
             • Pas de background jobs
             • Debugging difficile
```

### Option 3: HYBRIDE ✅ (Recommandée)
```
Client → NestJS (Orchestrateur) → Dispatch intelligent
                │
                ├── Opérations simples → Prisma direct (< 50ms)
                ├── Calculs lourds → Edge Functions (offload)
                ├── Aggregations → Materialized Views (pré-calculé)
                ├── Jobs longs → BullMQ Workers (async)
                └── Temps réel → Supabase Realtime (WebSocket)
```

---

## 🏗️ Architecture Hybride Détaillée

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Frontend)                                  │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    🎯 NestJS - CHEF D'ORCHESTRE                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Authentification & Autorisation (JWT, Guards)                     │    │
│  │  • Validation des requêtes (DTOs, Pipes)                            │    │
│  │  • Routing intelligent (décide qui traite quoi)                     │    │
│  │  • Gestion des erreurs centralisée                                  │    │
│  │  • Rate limiting & Throttling                                       │    │
│  │  • Logging & Monitoring                                             │    │
│  │  • Cache orchestration (Redis)                                      │    │
│  │  • Queue management (BullMQ)                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│         ┌──────────────────────────┼──────────────────────────┐             │
│         │                          │                          │             │
│         ▼                          ▼                          ▼             │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐         │
│  │   DIRECT    │          │   OFFLOAD   │          │    ASYNC    │         │
│  │   PRISMA    │          │    EDGE     │          │   WORKERS   │         │
│  │  (< 100ms)  │          │  FUNCTIONS  │          │  (BullMQ)   │         │
│  └─────────────┘          └─────────────┘          └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
         │                          │                          │
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE PLATFORM                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  PostgreSQL │  │    Edge     │  │ Materialized│  │  Realtime   │        │
│  │   + RLS     │  │  Functions  │  │    Views    │  │  (WebSocket)│        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │  PG Cron    │  │   Storage   │  │  PG Triggers│                         │
│  │  (Refresh)  │  │   (Files)   │  │  (Events)   │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Matrice de Décision : Qui Fait Quoi ?

| Opération | Responsable | Pourquoi |
|-----------|-------------|----------|
| **CRUD simple** | NestJS + Prisma | Rapide, type-safe, < 50ms |
| **Auth/Validation** | NestJS | Guards, Decorators, central |
| **Cache Read/Write** | NestJS + Redis | Orchestration centralisée |
| **Aggregations simples** | Materialized Views | Pré-calculé, < 10ms |
| **Calculs complexes** | Edge Functions | Offload CPU, scale auto |
| **Reports PDF/Excel** | BullMQ Workers | Async, pas de timeout |
| **Sync Weezevent** | BullMQ Workers | Long, resumable |
| **Notifications temps réel** | Supabase Realtime | WebSocket natif |
| **File uploads** | Supabase Storage | CDN intégré |
| **Scheduled jobs** | pg_cron | Reliable, dans la DB |

---

## 🔧 Implémentation Hybride

### 1. Service Orchestrateur NestJS

```typescript
// src/core/orchestrator/orchestrator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisCacheService } from '../cache/redis-cache.service';
import { SupabaseEdgeService } from './supabase-edge.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

export enum ProcessingStrategy {
  DIRECT = 'direct',           // Prisma direct
  CACHED = 'cached',           // Redis + Prisma
  EDGE_FUNCTION = 'edge',      // Supabase Edge Function
  ASYNC_WORKER = 'async',      // BullMQ Worker
  MATERIALIZED = 'materialized' // Materialized View
}

interface OperationConfig {
  strategy: ProcessingStrategy;
  cacheTTL?: number;
  edgeFunction?: string;
  queueName?: string;
  timeout?: number;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  // Configuration des opérations
  private readonly operationConfigs: Record<string, OperationConfig> = {
    // CRUD rapide → Prisma direct
    'user.get': { strategy: ProcessingStrategy.DIRECT },
    'space.list': { strategy: ProcessingStrategy.CACHED, cacheTTL: 60 },
    'tenant.get': { strategy: ProcessingStrategy.CACHED, cacheTTL: 300 },
    
    // Analytics → Materialized Views
    'analytics.dashboard': { strategy: ProcessingStrategy.MATERIALIZED },
    'analytics.summary': { strategy: ProcessingStrategy.MATERIALIZED },
    
    // Calculs lourds → Edge Functions
    'analytics.complex': { 
      strategy: ProcessingStrategy.EDGE_FUNCTION, 
      edgeFunction: 'compute-analytics',
      timeout: 10000 
    },
    'reports.generate-preview': { 
      strategy: ProcessingStrategy.EDGE_FUNCTION, 
      edgeFunction: 'generate-report-preview' 
    },
    'weezevent.transform': { 
      strategy: ProcessingStrategy.EDGE_FUNCTION, 
      edgeFunction: 'transform-weezevent-data' 
    },
    
    // Jobs longs → BullMQ
    'sync.weezevent-full': { 
      strategy: ProcessingStrategy.ASYNC_WORKER, 
      queueName: 'weezevent-sync' 
    },
    'reports.generate-full': { 
      strategy: ProcessingStrategy.ASYNC_WORKER, 
      queueName: 'reports' 
    },
    'exports.large-dataset': { 
      strategy: ProcessingStrategy.ASYNC_WORKER, 
      queueName: 'exports' 
    },
  };

  constructor(
    private prisma: PrismaService,
    private cache: RedisCacheService,
    private edgeService: SupabaseEdgeService,
    @InjectQueue('weezevent-sync') private syncQueue: Queue,
    @InjectQueue('reports') private reportsQueue: Queue,
    @InjectQueue('exports') private exportsQueue: Queue,
  ) {}

  /**
   * Point d'entrée intelligent - route vers la bonne stratégie
   */
  async execute<T>(
    operation: string,
    params: Record<string, any>,
    options?: { forceStrategy?: ProcessingStrategy }
  ): Promise<T> {
    const config = this.operationConfigs[operation];
    
    if (!config) {
      this.logger.warn(`Unknown operation: ${operation}, defaulting to DIRECT`);
      return this.executeDirect(operation, params);
    }

    const strategy = options?.forceStrategy || config.strategy;
    
    this.logger.debug(`Executing ${operation} with strategy: ${strategy}`);

    switch (strategy) {
      case ProcessingStrategy.DIRECT:
        return this.executeDirect(operation, params);
        
      case ProcessingStrategy.CACHED:
        return this.executeCached(operation, params, config.cacheTTL);
        
      case ProcessingStrategy.MATERIALIZED:
        return this.executeMaterialized(operation, params);
        
      case ProcessingStrategy.EDGE_FUNCTION:
        return this.executeEdge(config.edgeFunction!, params, config.timeout);
        
      case ProcessingStrategy.ASYNC_WORKER:
        return this.executeAsync(config.queueName!, operation, params);
        
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Stratégie DIRECT - Prisma simple
   */
  private async executeDirect<T>(operation: string, params: any): Promise<T> {
    const [model, action] = operation.split('.');
    // Exécution Prisma directe
    return this.prisma[model][action](params);
  }

  /**
   * Stratégie CACHED - Redis + Prisma
   */
  private async executeCached<T>(
    operation: string, 
    params: any, 
    ttl: number = 60
  ): Promise<T> {
    const cacheKey = `op:${operation}:${JSON.stringify(params)}`;
    
    return this.cache.getOrSet<T>(
      cacheKey,
      () => this.executeDirect(operation, params),
      { ttl, tags: [operation, params.tenantId].filter(Boolean) }
    );
  }

  /**
   * Stratégie MATERIALIZED - Vues matérialisées
   */
  private async executeMaterialized<T>(operation: string, params: any): Promise<T> {
    const { tenantId, ...filters } = params;
    
    // Query directe sur les vues matérialisées (ultra rapide)
    switch (operation) {
      case 'analytics.dashboard':
        return this.prisma.$queryRaw`
          SELECT * FROM mv_tenant_analytics 
          WHERE "tenantId" = ${tenantId}
          ORDER BY transaction_date DESC
          LIMIT 30
        ` as Promise<T>;
        
      case 'analytics.summary':
        return this.prisma.$queryRaw`
          SELECT * FROM mv_realtime_metrics 
          WHERE "tenantId" = ${tenantId}
        ` as Promise<T>;
        
      default:
        throw new Error(`No materialized view for: ${operation}`);
    }
  }

  /**
   * Stratégie EDGE_FUNCTION - Offload vers Supabase
   */
  private async executeEdge<T>(
    functionName: string, 
    params: any,
    timeout: number = 10000
  ): Promise<T> {
    return this.edgeService.invoke<T>(functionName, params, { timeout });
  }

  /**
   * Stratégie ASYNC_WORKER - BullMQ
   * Retourne immédiatement un job ID
   */
  private async executeAsync<T>(
    queueName: string, 
    operation: string, 
    params: any
  ): Promise<T> {
    const queue = this.getQueue(queueName);
    
    const job = await queue.add(operation, params, {
      priority: params.priority || 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });

    // Retour immédiat avec tracking info
    return {
      jobId: job.id,
      status: 'queued',
      operation,
      trackingUrl: `/api/v1/jobs/${job.id}`,
    } as T;
  }

  private getQueue(name: string): Queue {
    switch (name) {
      case 'weezevent-sync': return this.syncQueue;
      case 'reports': return this.reportsQueue;
      case 'exports': return this.exportsQueue;
      default: throw new Error(`Unknown queue: ${name}`);
    }
  }
}
```

### 2. Service Edge Functions Supabase

```typescript
// src/core/orchestrator/supabase-edge.service.ts
import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';

interface EdgeFunctionOptions {
  timeout?: number;
  retries?: number;
}

@Injectable()
export class SupabaseEdgeService {
  private readonly logger = new Logger(SupabaseEdgeService.name);
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;

  constructor(
    private config: ConfigService,
    private http: HttpService,
  ) {
    this.supabaseUrl = this.config.getOrThrow('SUPABASE_URL');
    this.supabaseKey = this.config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  }

  /**
   * Appeler une Edge Function Supabase
   */
  async invoke<T>(
    functionName: string, 
    payload: Record<string, any>,
    options: EdgeFunctionOptions = {}
  ): Promise<T> {
    const { timeout: timeoutMs = 10000, retries = 2 } = options;
    const url = `${this.supabaseUrl}/functions/v1/${functionName}`;
    
    this.logger.debug(`Invoking Edge Function: ${functionName}`);

    let lastError: Error;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.http.post<T>(url, payload, {
            headers: {
              'Authorization': `Bearer ${this.supabaseKey}`,
              'Content-Type': 'application/json',
            },
          }).pipe(
            timeout(timeoutMs),
            catchError(err => {
              throw new HttpException(
                `Edge Function ${functionName} failed: ${err.message}`,
                err.response?.status || 500
              );
            })
          )
        );

        this.logger.debug(`Edge Function ${functionName} completed`);
        return response.data;
        
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Edge Function ${functionName} attempt ${attempt + 1} failed: ${error.message}`
        );
        
        if (attempt < retries) {
          await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Appel parallèle de plusieurs Edge Functions
   */
  async invokeParallel<T>(
    calls: Array<{ function: string; payload: any }>
  ): Promise<T[]> {
    return Promise.all(
      calls.map(call => this.invoke<T>(call.function, call.payload))
    );
  }

  /**
   * Appel avec fallback local si Edge échoue
   */
  async invokeWithFallback<T>(
    functionName: string,
    payload: any,
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.invoke<T>(functionName, payload);
    } catch (error) {
      this.logger.warn(`Falling back to local for ${functionName}`);
      return fallback();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3. Edge Functions Supabase

```typescript
// supabase/functions/compute-analytics/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AnalyticsRequest {
  tenantId: string;
  dateRange: { start: string; end: string };
  metrics: string[];
  groupBy?: 'day' | 'week' | 'month';
}

serve(async (req: Request) => {
  try {
    const { tenantId, dateRange, metrics, groupBy = 'day' }: AnalyticsRequest = 
      await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Calculs lourds exécutés côté Edge (proche de la DB)
    const { data, error } = await supabase.rpc('compute_complex_analytics', {
      p_tenant_id: tenantId,
      p_start_date: dateRange.start,
      p_end_date: dateRange.end,
      p_metrics: metrics,
      p_group_by: groupBy,
    });

    if (error) throw error;

    // Post-processing Deno (CPU intensive)
    const processed = processAnalytics(data, metrics);

    return new Response(JSON.stringify(processed), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60', // Cache 1 min
      },
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function processAnalytics(data: any[], metrics: string[]) {
  // Calculs complexes: moyennes mobiles, tendances, comparaisons...
  return {
    summary: calculateSummary(data),
    trends: calculateTrends(data),
    comparisons: calculateComparisons(data),
    predictions: simplePrediction(data), // Peut être CPU intensive
  };
}
```

```typescript
// supabase/functions/transform-weezevent-data/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

interface TransformRequest {
  transactions: any[];
  tenantId: string;
  mappingRules?: Record<string, string>;
}

serve(async (req: Request) => {
  const { transactions, tenantId, mappingRules }: TransformRequest = 
    await req.json();

  // Transformation lourde de données (batch processing)
  const transformed = transactions.map(tx => ({
    weezeventId: tx.id.toString(),
    tenantId,
    amount: parseFloat(tx.amount) || 0,
    status: mapStatus(tx.status),
    transactionDate: new Date(tx.created_at),
    merchantId: tx.merchant?.id?.toString(),
    merchantName: tx.merchant?.name,
    locationId: tx.location?.id?.toString(),
    locationName: tx.location?.name,
    eventId: tx.event?.id?.toString(),
    eventName: tx.event?.name,
    items: transformItems(tx.items),
    metadata: extractMetadata(tx),
    rawData: tx,
  }));

  // Aggregations rapides
  const stats = {
    total: transformed.length,
    totalAmount: transformed.reduce((sum, tx) => sum + tx.amount, 0),
    byStatus: groupBy(transformed, 'status'),
    byMerchant: groupBy(transformed, 'merchantName'),
  };

  return new Response(JSON.stringify({ data: transformed, stats }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### 4. Controller Utilisant l'Orchestrateur

```typescript
// src/features/analytics/analytics.controller.ts
import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { OrchestratorService, ProcessingStrategy } from '../../core/orchestrator/orchestrator.service';
import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private orchestrator: OrchestratorService) {}

  /**
   * Dashboard rapide - Materialized View (< 50ms)
   */
  @Get('dashboard')
  async getDashboard(@CurrentTenant() tenantId: string) {
    return this.orchestrator.execute('analytics.dashboard', { tenantId });
  }

  /**
   * Métriques temps réel - Materialized View (< 20ms)
   */
  @Get('realtime')
  async getRealtimeMetrics(@CurrentTenant() tenantId: string) {
    return this.orchestrator.execute('analytics.summary', { tenantId });
  }

  /**
   * Analytics complexes - Edge Function (< 500ms)
   */
  @Post('complex')
  async getComplexAnalytics(
    @CurrentTenant() tenantId: string,
    @Body() body: ComplexAnalyticsDto,
  ) {
    return this.orchestrator.execute('analytics.complex', {
      tenantId,
      dateRange: body.dateRange,
      metrics: body.metrics,
      groupBy: body.groupBy,
    });
  }

  /**
   * Rapport complet - BullMQ Worker (retour immédiat)
   */
  @Post('report')
  async generateReport(
    @CurrentTenant() tenantId: string,
    @Body() body: GenerateReportDto,
  ) {
    return this.orchestrator.execute('reports.generate-full', {
      tenantId,
      ...body,
    });
  }
}
```

---

## 📊 Comparaison des Stratégies

| Critère | Direct | Cached | Materialized | Edge Function | Async Worker |
|---------|--------|--------|--------------|---------------|--------------|
| **Latence** | 50-200ms | 5-50ms | 5-20ms | 100-500ms | 0ms (queue) |
| **Scalabilité** | Moyenne | Haute | Haute | Très haute | Très haute |
| **Coût CPU** | Local | Local | DB | Edge | Worker |
| **Fraîcheur** | Temps réel | TTL | Refresh | Temps réel | Différé |
| **Complexité** | Faible | Moyenne | Moyenne | Haute | Haute |

---

## 🔄 Flow Complet : Sync Weezevent Hybride

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SYNC WEEZEVENT FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  1. NESTJS CONTROLLER                                                    │
│     POST /api/v1/weezevent/sync                                         │
│     • Validation DTO                                                     │
│     • Auth check                                                         │
│     • Rate limit check                                                   │
│     ↓                                                                    │
│     orchestrator.execute('sync.weezevent-full', params)                 │
│     ↓                                                                    │
│     Return { jobId, status: 'queued' } ← RETOUR IMMÉDIAT (< 50ms)       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. BULLMQ WORKER (Background)                                           │
│     • Fetch data from Weezevent API (paginated)                         │
│     ↓                                                                    │
│     Pour chaque batch de 100 transactions:                              │
│     ↓                                                                    │
│     edgeService.invoke('transform-weezevent-data', { transactions })    │
│     ↓                                                                    │
│     • Edge Function transforme les données (CPU offload)                │
│     ↓                                                                    │
│     prisma.$transaction([...upserts]) ← Batch insert                    │
│     ↓                                                                    │
│     job.updateProgress({ current, total, percentage })                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. POST-SYNC (Trigger PostgreSQL)                                       │
│     • Trigger après insert déclenche refresh des vues                   │
│     ↓                                                                    │
│     REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_analytics          │
│     ↓                                                                    │
│     • Invalide le cache Redis                                           │
│     ↓                                                                    │
│     • Notifie via Supabase Realtime                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. CLIENT NOTIFICATION                                                  │
│     • WebSocket reçoit: { event: 'sync:completed', data: stats }        │
│     • Dashboard se rafraîchit automatiquement                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Quand Utiliser Quoi ?

### ✅ Utiliser NestJS Direct (Prisma)
- CRUD simple (create, read, update, delete)
- Validations et transformations légères
- Opérations avec peu de données (< 1000 rows)
- Temps réel requis (pas de cache possible)

### ✅ Utiliser Redis Cache
- Données lues fréquemment, peu modifiées
- Listes, configurations, profils
- Tout ce qui peut tolérer 60-300s de stale

### ✅ Utiliser Materialized Views
- Dashboards, analytics, KPIs
- Aggregations sur gros volumes
- Requêtes répétitives avec même structure

### ✅ Utiliser Edge Functions
- Calculs CPU intensifs (stats, ML)
- Transformations de données complexes
- Génération de previews (PDF, images)
- Tout ce qui bénéficie d'être proche de la DB

### ✅ Utiliser BullMQ Workers
- Sync de données externes (Weezevent)
- Génération de rapports complets
- Exports volumineux
- Tout ce qui prend > 10 secondes

---

## 📋 Checklist d'Implémentation

### Phase 1: Infrastructure (Semaine 1)
- [ ] Configurer Redis pour cache + BullMQ
- [ ] Créer `OrchestratorService`
- [ ] Créer `SupabaseEdgeService`
- [ ] Définir la matrice opérations/stratégies

### Phase 2: Edge Functions (Semaine 2)
- [ ] Déployer `compute-analytics`
- [ ] Déployer `transform-weezevent-data`
- [ ] Déployer `generate-report-preview`
- [ ] Tests de performance

### Phase 3: Materialized Views (Semaine 3)
- [ ] Créer `mv_tenant_analytics`
- [ ] Créer `mv_realtime_metrics`
- [ ] Configurer pg_cron pour refresh
- [ ] Créer triggers de refresh

### Phase 4: Intégration (Semaine 4)
- [ ] Migrer controllers vers orchestrateur
- [ ] Implémenter WebSocket notifications
- [ ] Tests end-to-end
- [ ] Monitoring et alerting

---

## 🎭 Résumé

**L'architecture hybride** est la meilleure approche car elle combine:

| Composant | Rôle | Avantage |
|-----------|------|----------|
| **NestJS** | Chef d'orchestre | Contrôle, auth, validation, routing |
| **Redis** | Cache intelligent | Latence minimale pour lectures |
| **Edge Functions** | Calculs offloadés | Scale auto, proche de la DB |
| **BullMQ** | Jobs async | Pas de timeout, resumable |
| **Materialized Views** | Données pré-calculées | Queries ultra-rapides |
| **Supabase Realtime** | Notifications | WebSocket sans effort |

**Résultat:** Latence < 500ms garantie, scalabilité horizontale, coûts optimisés.
