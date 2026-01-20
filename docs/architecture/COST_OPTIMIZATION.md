# 💰 Optimisation des Coûts - Architecture HEOS

**Objectif:** Réduire les coûts de 40-60% sans sacrifier les performances  
**Date:** 20 janvier 2026

---

## 📊 Comparaison : Avant vs Après Optimisation

### Configuration "Growth" (1K-10K users)

| Composant | Avant | Après | Économie |
|-----------|-------|-------|----------|
| **Database** | Supabase Pro ($25) | Supabase Pro ($25) | $0 |
| **API Server** | Railway ($30) | Fly.io ($10) | **-$20** |
| **Workers** | Railway x2 ($20) | Fly.io machines ($5) | **-$15** |
| **Redis** | Upstash ($10) | Upstash Free + Dragonfly | **-$10** |
| **CDN** | Cloudflare Pro ($20) | Cloudflare Free | **-$20** |
| **Monitoring** | Sentry ($26) | Sentry Free + Better Stack | **-$20** |
| **TOTAL** | **$131/mois** | **$50-60/mois** | **-55%** |

---

## 🎯 Stratégies d'Optimisation

### 1. 🖥️ Compute : Fly.io au lieu de Railway/Render

**Pourquoi Fly.io ?**
- Pay-per-use (facturé à la seconde)
- Scale to zero possible
- Machines éphémères pour workers
- Régions multiples incluses

```toml
# fly.toml - API principale
app = "datafriday-api"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true      # 💰 Stop quand pas de trafic
  auto_start_machines = true
  min_machines_running = 1       # Au moins 1 machine
  
[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512                # Suffisant pour NestJS

[[vm.processes]]
  name = "api"
  
# Workers séparés (scale to zero)
[[vm.processes]]
  name = "worker"
  auto_stop_machines = true
  min_machines_running = 0       # 💰 0 quand pas de jobs
```

**Coût Fly.io estimé:**
| Usage | Coût |
|-------|------|
| API (always on, shared-cpu-1x) | ~$5/mois |
| Workers (scale to zero) | ~$2-5/mois |
| **Total compute** | **$7-10/mois** vs $50 Railway |

### 2. 🗄️ Redis : Stratégie Hybride

**Option A: Upstash Free Tier + Cache Local**

```typescript
// src/core/cache/hybrid-cache.service.ts
@Injectable()
export class HybridCacheService {
  private localCache = new Map<string, { value: any; expires: number }>();
  private redis: Redis; // Upstash

  constructor() {
    this.redis = new Redis(process.env.UPSTASH_REDIS_URL);
  }

  async get<T>(key: string): Promise<T | null> {
    // 1. Check local cache first (0ms)
    const local = this.localCache.get(key);
    if (local && local.expires > Date.now()) {
      return local.value as T;
    }

    // 2. Check Redis (Upstash)
    const remote = await this.redis.get(key);
    if (remote) {
      // Store locally for next requests
      this.localCache.set(key, {
        value: JSON.parse(remote),
        expires: Date.now() + 30000, // 30s local TTL
      });
      return JSON.parse(remote) as T;
    }

    return null;
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    // Store both locally and remotely
    this.localCache.set(key, {
      value,
      expires: Date.now() + Math.min(ttl * 1000, 30000),
    });
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

**Upstash Free Tier:**
- 10K commandes/jour
- 256MB storage
- **$0/mois** pour usage modéré

**Option B: Dragonfly (Self-hosted sur Fly.io)**

```toml
# fly.toml pour Dragonfly (Redis compatible, plus efficace)
app = "datafriday-cache"

[build]
  image = "docker.dragonflydb.io/dragonflydb/dragonfly"

[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[mounts]
  source = "dragonfly_data"
  destination = "/data"
```

**Coût:** ~$3/mois (vs $10 Upstash payant)

### 3. 🌐 CDN : Cloudflare Free + Cache Strategy

**Cloudflare Free inclut:**
- CDN illimité
- DDoS protection
- SSL gratuit
- Cache Rules (limité mais suffisant)

```typescript
// Maximiser le cache Cloudflare
@Controller('api/v1')
export class ApiController {
  
  @Get('public/events')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=3600')
  // s-maxage = cache CDN (1h), max-age = cache browser (5min)
  async getPublicEvents() {
    return this.eventsService.getPublic();
  }

  @Get('dashboard')
  @Header('Cache-Control', 'private, max-age=60')
  // Pas de cache CDN pour données privées
  async getDashboard(@CurrentTenant() tenantId: string) {
    return this.orchestrator.execute('analytics.dashboard', { tenantId });
  }
}
```

**Headers pour maximiser cache CDN:**
```typescript
// src/common/interceptors/cache-headers.interceptor.ts
@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const request = context.switchToHttp().getRequest();
        
        // Routes publiques = cache agressif
        if (request.path.includes('/public/')) {
          response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
          response.setHeader('CDN-Cache-Control', 'max-age=3600');
        }
        
        // API authentifiée = cache court
        else if (request.user) {
          response.setHeader('Cache-Control', 'private, max-age=60');
        }
      }),
    );
  }
}
```

### 4. 📊 Monitoring : Stack Gratuite

**Remplacer Sentry ($26) par:**

| Outil | Usage | Coût |
|-------|-------|------|
| **Sentry Free** | Error tracking | $0 (5K events/mois) |
| **Better Stack Free** | Uptime monitoring | $0 |
| **Axiom Free** | Logs | $0 (500MB/mois) |
| **Fly.io Metrics** | APM basique | Inclus |

```typescript
// src/core/monitoring/monitoring.module.ts
import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

@Module({})
export class MonitoringModule {
  static forRoot(): DynamicModule {
    // Sentry Free (errors only)
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1, // 10% des transactions (économise quota)
        environment: process.env.NODE_ENV,
      });
    }

    return {
      module: MonitoringModule,
      providers: [
        {
          provide: 'LOGGER',
          useFactory: () => {
            // Axiom pour logs (gratuit jusqu'à 500MB/mois)
            if (process.env.AXIOM_TOKEN) {
              return new AxiomLogger();
            }
            return new Logger();
          },
        },
      ],
    };
  }
}
```

### 5. 🗃️ Supabase : Optimiser l'Usage

**Rester sur le Free Tier plus longtemps:**

| Limite Free | Stratégie |
|-------------|-----------|
| 500MB DB | Archiver les vieilles données |
| 2GB bandwidth | Cache agressif + pagination |
| 50K auth users | OK pour la plupart des cas |
| 500K Edge invocations | Batching des appels |

```typescript
// Archiver les données > 90 jours
@Cron('0 0 * * 0') // Chaque dimanche
async archiveOldData() {
  const ninetyDaysAgo = subDays(new Date(), 90);
  
  // 1. Exporter vers Storage (pas de limite)
  const oldTransactions = await this.prisma.weezeventTransaction.findMany({
    where: { transactionDate: { lt: ninetyDaysAgo } },
  });
  
  // 2. Compresser et stocker
  const archive = gzip(JSON.stringify(oldTransactions));
  await supabase.storage
    .from('archives')
    .upload(`transactions/${format(ninetyDaysAgo, 'yyyy-MM')}.json.gz`, archive);
  
  // 3. Supprimer de la DB
  await this.prisma.weezeventTransaction.deleteMany({
    where: { transactionDate: { lt: ninetyDaysAgo } },
  });
  
  this.logger.log(`Archived ${oldTransactions.length} transactions`);
}
```

### 6. ⚡ Edge Functions : Batching

**Réduire le nombre d'invocations:**

```typescript
// ❌ AVANT: 1 appel par transaction (500K appels/mois)
for (const tx of transactions) {
  await edgeService.invoke('transform', { transaction: tx });
}

// ✅ APRÈS: 1 appel pour 500 transactions (1K appels/mois)
const batches = chunk(transactions, 500);
for (const batch of batches) {
  await edgeService.invoke('transform-batch', { transactions: batch });
}
```

**Économie:** 500K → 1K invocations = **reste dans le Free Tier**

---

## 📋 Configuration Ultra-Économique

### Stack "Startup Bootstrapped" : ~$25-35/mois

| Composant | Service | Coût |
|-----------|---------|------|
| Database + Edge + Storage | **Supabase Free** | $0 |
| API + Workers | **Fly.io** | $10 |
| Cache | **Upstash Free** | $0 |
| CDN | **Cloudflare Free** | $0 |
| Monitoring | **Stack gratuite** | $0 |
| Domain | **Cloudflare Registrar** | $10/an |
| **TOTAL** | | **~$10-15/mois** |

⚠️ **Limites:** 500MB DB, 2GB bandwidth, 50K auth users

### Stack "Growth Optimisée" : ~$50-70/mois

| Composant | Service | Coût |
|-----------|---------|------|
| Database | **Supabase Pro** | $25 |
| API | **Fly.io** | $5-10 |
| Workers | **Fly.io (scale to zero)** | $5 |
| Cache | **Dragonfly sur Fly** | $3 |
| CDN | **Cloudflare Free** | $0 |
| Monitoring | **Stack gratuite** | $0 |
| **TOTAL** | | **~$40-50/mois** |

✅ **Capacité:** 8GB DB, bandwidth illimité, 100K+ users

---

## 🔧 Scripts de Déploiement Économique

### deploy-fly.sh

```bash
#!/bin/bash
# Déploiement sur Fly.io (économique)

# 1. API principale
fly deploy --config fly.api.toml --strategy rolling

# 2. Workers (scale to zero par défaut)
fly deploy --config fly.worker.toml

# 3. Cache Dragonfly (si self-hosted)
fly deploy --config fly.cache.toml

echo "✅ Deployed! Estimated cost: ~$15/month"
```

### docker-compose.local.yml (Dev gratuit)

```yaml
# Développement 100% local = $0
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/datafriday
      - REDIS_URL=redis://cache:6379
    depends_on:
      - db
      - cache

  db:
    image: supabase/postgres:15.1.0.147
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  cache:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    ports:
      - "6379:6379"
    volumes:
      - dragonfly_data:/data

  # Supabase local (studio inclus)
  studio:
    image: supabase/studio:latest
    ports:
      - "3001:3000"
    environment:
      SUPABASE_URL: http://localhost:8000
      STUDIO_PG_META_URL: http://localhost:5432

volumes:
  postgres_data:
  dragonfly_data:
```

---

## 📊 Tableau Récapitulatif des Économies

| Configuration | Avant | Après | Économie |
|---------------|-------|-------|----------|
| **Starter** | $50-80 | **$10-25** | **-60%** |
| **Growth** | $120-200 | **$40-70** | **-60%** |
| **Scale** | $400-800 | **$150-300** | **-55%** |

---

## 🎯 Checklist Optimisation Coûts

### Immédiat (Jour 1)
- [ ] Migrer vers Fly.io (scale to zero)
- [ ] Passer Cloudflare en Free
- [ ] Configurer cache headers pour CDN
- [ ] Utiliser Upstash Free + cache local

### Court terme (Semaine 1)
- [ ] Implémenter HybridCacheService
- [ ] Batching des Edge Functions
- [ ] Configurer Sentry Free (sampling 10%)
- [ ] Ajouter Axiom pour logs

### Moyen terme (Mois 1)
- [ ] Archivage automatique des vieilles données
- [ ] Monitoring avec stack gratuite
- [ ] Optimiser queries Prisma (n+1, indexes)
- [ ] Review mensuelle des coûts

---

## 💡 Astuces Bonus

### 1. GitHub Actions = CI/CD gratuit
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### 2. Vercel pour le Frontend = gratuit
- Build automatique
- CDN mondial
- Preview deployments
- 100GB bandwidth/mois

### 3. Planetscale Free Tier (alternative à Supabase)
- 5GB storage
- 1 billion row reads/mois
- Branching gratuit

---

## 🏆 Résultat Final

| Métrique | Standard | Optimisé |
|----------|----------|----------|
| **Coût mensuel** | $130-200 | **$40-70** |
| **Économie annuelle** | - | **$1000-1500** |
| **Performance** | ✅ | ✅ (identique) |
| **Scalabilité** | ✅ | ✅ (identique) |
| **Complexité** | Moyenne | Moyenne |

**Conclusion:** Avec ces optimisations, vous pouvez faire tourner une app SaaS pour **moins de $50/mois** tout en gardant les mêmes performances et la même scalabilité ! 🚀
