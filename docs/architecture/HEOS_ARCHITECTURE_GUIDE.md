# 🏛️ Architecture HEOS (Hybrid Event-driven Orchestrated System)

**Version:** 1.0  
**Auteur:** DataFriday Team  
**Date:** 20 janvier 2026

---

## 📛 Nom de l'Architecture

### **HEOS** - Hybrid Event-driven Orchestrated System

Ou en français : **Système Orchestré Hybride Événementiel**

#### Autres noms possibles :
- **CQRS-H** (CQRS Hybride avec Edge Computing)
- **Orchestrated Serverless Architecture (OSA)**
- **Smart Dispatch Architecture (SDA)**
- **Tiered Processing Architecture (TPA)**

#### Caractéristiques qui définissent HEOS :

| Lettre | Signification | Implémentation |
|--------|---------------|----------------|
| **H** | Hybrid | NestJS + Edge Functions + Workers |
| **E** | Event-driven | Queues, Webhooks, Realtime |
| **O** | Orchestrated | NestJS comme chef d'orchestre central |
| **S** | Scalable | Auto-scale par couche indépendante |

---

## 💰 Coût Mensuel Estimé

### Scénario : Application SaaS moyenne (DataFriday)

| Composant | Service | Spécifications | Coût/mois |
|-----------|---------|----------------|-----------|
| **API Server** | Railway / Render | 2 vCPU, 2GB RAM | $20-40 |
| **Workers (x2)** | Railway / Render | 1 vCPU, 1GB RAM x2 | $20-30 |
| **PostgreSQL** | Supabase Pro | 8GB RAM, 100GB storage | $25 |
| **Redis** | Upstash | 10GB, 10K cmd/day | $10 |
| **Edge Functions** | Supabase | 500K invocations | Inclus |
| **Storage** | Supabase | 100GB | Inclus |
| **Realtime** | Supabase | 200 concurrent | Inclus |
| **CDN** | Cloudflare | Pro | $20 |
| **Monitoring** | Sentry | Team | $26 |

### 📊 Total par Taille de Projet

| Taille | Users/mois | Transactions | Coût/mois | Coût/user |
|--------|------------|--------------|-----------|-----------|
| **Starter** | < 1K | < 100K | **$50-80** | $0.05-0.08 |
| **Growth** | 1K-10K | 100K-1M | **$120-200** | $0.01-0.02 |
| **Scale** | 10K-100K | 1M-10M | **$400-800** | $0.004-0.008 |
| **Enterprise** | > 100K | > 10M | **$1500+** | < $0.015 |

### 💡 Comparaison avec Alternatives

| Architecture | Coût Growth | Scalabilité | Complexité |
|--------------|-------------|-------------|------------|
| **HEOS (cette archi)** | $150/mois | ⭐⭐⭐⭐⭐ | Moyenne |
| Monolithe classique | $100/mois | ⭐⭐ | Faible |
| Full Serverless | $200-400/mois | ⭐⭐⭐⭐ | Haute |
| Microservices K8s | $500-1000/mois | ⭐⭐⭐⭐⭐ | Très haute |

**HEOS offre le meilleur rapport coût/scalabilité/complexité**

---

## 🔄 Réutilisabilité pour Autres Projets

L'architecture est réutilisable. Le point d'entrée dans ce projet est `src/features/orchestrator/`.

---

## 🎯 Dans Quels Cas Utiliser HEOS ?

### ✅ Cas IDÉAUX pour HEOS

| Cas d'Usage | Exemple | Pourquoi HEOS |
|-------------|---------|---------------|
| **SaaS B2B Multi-tenant** | DataFriday, CRM, ERP | Isolation données + Scale par tenant |
| **Plateforme Analytics** | Dashboard, BI tools | Gros volumes + Cache + Views |
| **E-commerce** | Marketplace, Inventory | Transactions + Search + Exports |
| **Intégrations API** | Agrégateurs, Sync | Webhooks + Queues + Transform |
| **Fintech** | Paiements, Reporting | Compliance + Audit + Performance |
| **IoT Backend** | Capteurs, Telemetry | Events + Time-series + Realtime |
| **Media Platform** | Streaming, UGC | Upload + Process + CDN |

### ✅ Signaux que vous avez BESOIN de HEOS

```
□ Volume de données > 100K rows
□ Plusieurs sources de données (APIs externes)
□ Besoin de rapports/exports lourds
□ Dashboard temps réel requis
□ Multi-tenant (SaaS)
□ Pics de charge prévisibles (événements)
□ Budget limité mais besoin de scale
□ Équipe < 10 développeurs
```

**Si 4+ cases cochées → HEOS est fait pour vous !**

### ❌ Cas où HEOS est OVERKILL

| Cas | Alternative Recommandée |
|-----|------------------------|
| MVP simple < 1K users | Monolithe NestJS simple |
| Site vitrine | Jamstack (Next.js + Vercel) |
| App mobile simple | Firebase / Supabase direct |
| Prototype rapide | No-code (Bubble, Retool) |
| Très gros budget | Microservices Kubernetes |

---

## 📋 Template HEOS Générique

### Structure de Base Réutilisable

```typescript
// src/core/orchestrator/orchestrator.service.ts
// VERSION GÉNÉRIQUE - À copier dans vos projets

import { Injectable, Logger } from '@nestjs/common';

export enum ProcessingStrategy {
  DIRECT = 'direct',
  CACHED = 'cached',
  EDGE_FUNCTION = 'edge',
  ASYNC_WORKER = 'async',
  MATERIALIZED = 'materialized',
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
  
  // Configuration des opérations - À ADAPTER PAR PROJET
  private operationConfigs: Map<string, OperationConfig> = new Map();

  constructor(
    private prisma: PrismaService,
    private cache: RedisCacheService,
    private edge: SupabaseEdgeService,
    private queues: QueueManagerService,
  ) {}

  /**
   * Enregistrer une opération avec sa stratégie
   */
  registerOperation(name: string, config: OperationConfig): void {
    this.operationConfigs.set(name, config);
    this.logger.log(`Registered operation: ${name} → ${config.strategy}`);
  }

  /**
   * Exécuter une opération avec dispatch automatique
   */
  async execute<T>(operation: string, params: any): Promise<T> {
    const config = this.operationConfigs.get(operation);
    
    if (!config) {
      this.logger.warn(`Unknown operation: ${operation}, using DIRECT`);
      return this.executeDirect(operation, params);
    }

    const startTime = Date.now();

    try {
      const result = await this.dispatch<T>(config, operation, params);
      
      this.logger.debug(
        `${operation} completed in ${Date.now() - startTime}ms via ${config.strategy}`
      );
      
      return result;
    } catch (error) {
      this.logger.error(`${operation} failed: ${error.message}`);
      throw error;
    }
  }

  private async dispatch<T>(
    config: OperationConfig,
    operation: string,
    params: any,
  ): Promise<T> {
    switch (config.strategy) {
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
        throw new Error(`Unknown strategy: ${config.strategy}`);
    }
  }

  // ... implémentations des stratégies
}
```

### Module HEOS Prêt à l'Emploi

```typescript
// src/features/orchestrator/heos.module.ts
import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrchestratorService } from './orchestrator.service';
import { RedisCacheService } from './cache/redis-cache.service';
import { SupabaseEdgeService } from './edge/supabase-edge.service';
import { QueueManagerService } from './queue/queue-manager.service';

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
  ],
  providers: [
    OrchestratorService,
    RedisCacheService,
    SupabaseEdgeService,
    QueueManagerService,
  ],
  exports: [
    OrchestratorService,
    RedisCacheService,
    SupabaseEdgeService,
    QueueManagerService,
  ],
})
export class HeosModule {}
```

---

## 🚀 Guide de Démarrage pour Nouveau Projet

### Étape 1: Copier le module orchestrateur

```bash
# Copier depuis ce projet
cp -r api-datafriday-staging/src/features/orchestrator nouveau-projet/src/features/
```

### Étape 2: Configurer les Opérations

```typescript
// src/app.module.ts
@Module({
  imports: [HeosModule, ...],
})
export class AppModule implements OnModuleInit {
  constructor(private orchestrator: OrchestratorService) {}

  onModuleInit() {
    // Définir les opérations de VOTRE projet
    this.orchestrator.registerOperation('products.list', {
      strategy: ProcessingStrategy.CACHED,
      cacheTTL: 300,
    });

    this.orchestrator.registerOperation('analytics.compute', {
      strategy: ProcessingStrategy.EDGE_FUNCTION,
      edgeFunction: 'compute-analytics',
      timeout: 10000,
    });

    this.orchestrator.registerOperation('reports.generate', {
      strategy: ProcessingStrategy.ASYNC_WORKER,
      queueName: 'reports',
    });
  }
}
```

### Étape 3: Utiliser dans les Controllers

```typescript
@Controller('products')
export class ProductsController {
  constructor(private orchestrator: OrchestratorService) {}

  @Get()
  async list(@Query() filters: ProductFiltersDto) {
    return this.orchestrator.execute('products.list', filters);
  }

  @Post('report')
  async generateReport(@Body() dto: ReportDto) {
    return this.orchestrator.execute('reports.generate', dto);
  }
}
```

---

## 📊 Exemples de Projets Utilisant HEOS

### 1. 🏟️ DataFriday (Actuel)
- **Domaine:** Analytics événementiel
- **Volume:** 500K transactions/mois
- **Coût:** ~$150/mois

### 2. 🛒 E-commerce Multi-vendor (Exemple)
```typescript
// Opérations typiques
orchestrator.registerOperation('catalog.search', {
  strategy: ProcessingStrategy.CACHED, // Elasticsearch + Redis
  cacheTTL: 60,
});

orchestrator.registerOperation('order.process', {
  strategy: ProcessingStrategy.ASYNC_WORKER, // Payment + Inventory
  queueName: 'orders',
});

orchestrator.registerOperation('seller.analytics', {
  strategy: ProcessingStrategy.MATERIALIZED, // Dashboard vendeur
});
```

### 3. 📊 BI Platform (Exemple)
```typescript
// Opérations typiques
orchestrator.registerOperation('dashboard.widgets', {
  strategy: ProcessingStrategy.CACHED,
  cacheTTL: 300,
});

orchestrator.registerOperation('query.execute', {
  strategy: ProcessingStrategy.EDGE_FUNCTION, // Calculs SQL lourds
  edgeFunction: 'execute-query',
  timeout: 30000,
});

orchestrator.registerOperation('export.csv', {
  strategy: ProcessingStrategy.ASYNC_WORKER,
  queueName: 'exports',
});
```

### 4. 🏥 Healthcare SaaS (Exemple)
```typescript
// Opérations typiques
orchestrator.registerOperation('patient.record', {
  strategy: ProcessingStrategy.DIRECT, // Données sensibles, pas de cache
});

orchestrator.registerOperation('analytics.population', {
  strategy: ProcessingStrategy.EDGE_FUNCTION, // Anonymisation + Calculs
  edgeFunction: 'compute-population-stats',
});

orchestrator.registerOperation('report.compliance', {
  strategy: ProcessingStrategy.ASYNC_WORKER,
  queueName: 'compliance-reports',
});
```

---

## Résumé

| Question | Réponse |
|----------|---------|
| **Nom** | **HEOS** (Hybrid Event-driven Orchestrated System) |
| **Coût mensuel** | **$50-200** pour la plupart des projets |
| **Réutilisable ?** | OUI — copier `src/features/orchestrator/` |
| **Pour quels projets ?** | SaaS B2B, Analytics, E-commerce, Intégrations API |
| **Équipe minimale** | 1-3 développeurs |
