# 🛠️ Implémentation de l'audit — Récap & actions manuelles

**Date :** 7 mai 2026
**Référence :** [AUDIT_BACKEND_SCALABILITY_2026.md](./AUDIT_BACKEND_SCALABILITY_2026.md)

---

## ✅ Implémenté automatiquement

### Sprint 1 — Production-ready

| ID | Fichier | Changement |
|----|---------|------------|
| C1 | [src/app.module.ts](../src/app.module.ts) | `envFilePath` dynamique (cascade `NODE_ENV` → `envFiles/.env` → `.env`) + `expandVariables` |
| C3 | [src/main.ts](../src/main.ts) | CSP durci : `'unsafe-inline'` retiré en production, `connectSrc` whitelisté (Weezevent, Supabase), `frameAncestors: 'none'`, `objectSrc: 'none'`, `referrerPolicy strict-origin`, HSTS prod |
| H2 | [src/main.ts](../src/main.ts) | `app.enableShutdownHooks()` + handlers `SIGTERM`/`SIGINT` pour shutdown gracieux |
| M3 | [src/main.ts](../src/main.ts) | `bodyLimit: 5MB` Fastify + `trustProxy: true` (LB/CDN) + `forbidNonWhitelisted: true` + `validationError` n'expose plus le payload |
| L4 | [src/main.ts](../src/main.ts) | `logger: true` Fastify désactivé en production (évite double-logging) |

### Sprint 2 — Performance & résilience

| ID | Fichier | Changement |
|----|---------|------------|
| C2 | [src/features/spaces/services/space-dashboard.service.ts](../src/features/spaces/services/space-dashboard.service.ts) | **3 patterns N+1 supprimés** : `revenueByShop` (~30 queries → 1), `topShops` (10 queries → 1), `topProducts` (10 queries → 1). Charge 1 dashboard ≈ 50 queries → 5 queries |
| H1 | [src/main.ts](../src/main.ts) | Bascule **Fastify-natif** : `@fastify/helmet`, `@fastify/compress` (gzip + brotli) au lieu des middlewares Express |
| H4 | [src/features/weezevent/services/weezevent-api.service.ts](../src/features/weezevent/services/weezevent-api.service.ts) | **Circuit breaker `opossum`** : ouvre à 50 % d'erreurs, reset 30 s, fail-fast → empêche l'effondrement en cascade quand Weezevent est down |
| H5 | [src/features/weezevent/services/weezevent-api.service.ts](../src/features/weezevent/services/weezevent-api.service.ts) | Timeout HTTP plafonné **après** le spread → un appelant ne peut plus l'écraser (`Math.min(options.timeout ?? 15s, 15s)`) |

### Sprint 4 — Observabilité & sécurité

| ID | Fichier | Changement |
|----|---------|------------|
| L1 | [src/health/health.controller.ts](../src/health/health.controller.ts) | `/health/detailed` vérifie maintenant **Prisma** (`SELECT 1`) avec mesure de latence |
| M5 | [src/core/database/prisma.service.ts](../src/core/database/prisma.service.ts) | Slow query log en production (seuil `PRISMA_SLOW_QUERY_MS`, défaut 500 ms) ; full debug en dev |
| M2 | [src/core/webhooks/webhooks.service.ts](../src/core/webhooks/webhooks.service.ts) | Anti-replay webhooks sortants : nonce `X-Webhook-Id` + signature **`t=timestamp,v1=hmac(timestamp.body)`** (style Stripe) — empêche le replay et l'altération du timestamp |

### Dépendances ajoutées

```bash
pnpm add @fastify/helmet @fastify/compress opossum
pnpm add -D @types/opossum
```

✅ `pnpm build` passe sans erreur.

---

## ⚠️ Actions manuelles requises

### 🔴 PRIORITÉ HAUTE

#### 1. Variables d'environnement à créer/vérifier en production

Dans le secret manager (Render, Vercel, k8s…) :

```bash
NODE_ENV=production

# Supabase
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service>
JWT_SECRET=<supabase-jwt-secret>     # Settings > API > JWT Secret

# Encryption (32 bytes hex) — NE PAS REGENERER une fois en prod
ENCRYPTION_KEY=<64 hex chars>

# Database (PgBouncer pour pool runtime)
DATABASE_URL=postgresql://postgres.<id>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=20
DIRECT_URL=postgresql://postgres.<id>:<pwd>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# Redis dédié BullMQ (séparé d'Upstash si Upstash utilisé pour cache uniquement)
REDIS_URL=rediss://...
REDIS_QUEUE_URL=redis://...    # éviter les quotas Upstash sur le polling BullMQ

# CORS
CORS_ORIGINS=https://app.datafriday.com,https://staging.datafriday.com
API_BASE_URL=https://api.datafriday.com

# Weezevent
WEEZEVENT_API_URL=https://api.weezevent.com
WEEZEVENT_HTTP_TIMEOUT_MS=15000
WEEZEVENT_BREAKER_THRESHOLD=50
WEEZEVENT_BREAKER_RESET_MS=30000

# Slow query log
PRISMA_SLOW_QUERY_MS=500
```

➡️ **Vérifier** que le fichier `envFiles/.env.production` existe sur la machine de build, ou que les variables sont injectées par l'orchestrateur.

#### 2. Vérifier `schema.prisma` — `directUrl` configuré

Ouvrir [prisma/schema.prisma](../prisma/schema.prisma) et confirmer :

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Requis pour `prisma migrate` avec PgBouncer
}
```

Sinon, ajouter `directUrl` puis :

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

#### 3. Throttler — passer le storage en Redis (cluster-safe)

Le `ThrottlerModule` actuel utilise un store **mémoire** : à 10 k+ users sur plusieurs pods, chaque pod a son propre compteur (rate limiting inefficace).

**À installer + configurer (env: prod) :**

```bash
pnpm add @nest-lab/throttler-storage-redis
```

Puis remplacer dans [src/app.module.ts](../src/app.module.ts) :

```ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

ThrottlerModule.forRootAsync({
  imports: [RedisModule.forRoot()],
  inject: [REDIS_CLIENT],
  useFactory: (redis) => ({
    throttlers: [
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 300 },
      { name: 'long', ttl: 3_600_000, limit: 5_000 },
    ],
    storage: new ThrottlerStorageRedisService(redis),
  }),
}),
```

> Volontairement non implémenté automatiquement : nécessite un test d'intégration Redis (changement de comportement sous charge réelle).

---

### 🟠 PRIORITÉ MOYENNE

#### 4. Stratégies JWT — supprimer la legacy

La stratégie `JwtStrategy` (defaultStrategy `'jwt'`) co-existe encore avec `JwtDatabaseStrategy` (`'jwt-db'`). Aucune route ne l'utilise plus, mais elle reste exportée.

**Action :**
1. Vérifier qu'aucune route n'utilise `JwtAuthGuard` (legacy) :
   ```bash
   grep -r "JwtAuthGuard\b" src/  # devrait être vide
   ```
2. Supprimer dans [src/core/auth/auth.module.ts](../src/core/auth/auth.module.ts) :
   ```ts
   providers: [
     // JwtStrategy,  ← supprimer
     JwtOnboardingStrategy,
     JwtDatabaseStrategy,
   ],
   ```
3. Supprimer les fichiers `jwt.strategy.ts`, `jwt.strategy.spec.ts`, `jwt.guard.ts`, `jwt.guard.spec.ts`.
4. Mettre à jour [src/core/auth/strategies/jwt-onboarding.strategy.ts](../src/core/auth/strategies/jwt-onboarding.strategy.ts) qui importe `JwtPayload` depuis `./jwt.strategy` → définir un payload local.

> Non automatisé pour ne pas casser des fichiers de tests dépendants. ~30 min.

#### 5. Logging structuré (`nestjs-pino`)

Toujours en `console.log()` / `Logger.log()` non structuré → ingestion Datadog/Loki/Grafana difficile.

```bash
pnpm add nestjs-pino pino-http pino
pnpm add -D pino-pretty
```

Bootstrap (extrait `main.ts`) :

```ts
import { Logger as PinoLogger } from 'nestjs-pino';
const app = await NestFactory.create(AppModule, new FastifyAdapter(...), { bufferLogs: true });
app.useLogger(app.get(PinoLogger));
```

`AppModule` :

```ts
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret', '*.token'],
    customProps: (req) => ({
      tenantId: (req as any).user?.tenantId,
      userId: (req as any).user?.id,
    }),
  },
}),
```

> Non automatisé : impacte tous les `Logger` de l'app + nécessite tests.

#### 6. Cache stampede — lock distribué Redis

Sur l'expiration du cache auth (`auth:user:*`), 1000+ requêtes simultanées hitent la DB. La protection actuelle (`pendingLookups` Map) est **par instance** → inefficace en cluster.

**À ajouter dans [src/core/auth/strategies/jwt-db-lookup.strategy.ts](../src/core/auth/strategies/jwt-db-lookup.strategy.ts) :**

```ts
private async withDistributedLock<T>(
  lockKey: string,
  ttlSec: number,
  factory: () => Promise<T>,
): Promise<T> {
  const lockValue = randomUUID();
  const acquired = await this.redis['redis'].set(lockKey, lockValue, 'EX', ttlSec, 'NX');
  if (acquired === 'OK') {
    try { return await factory(); }
    finally {
      // release seulement si on est toujours owner (Lua script idéal)
      const cur = await this.redis['redis'].get(lockKey);
      if (cur === lockValue) await this.redis['redis'].del(lockKey);
    }
  }
  // wait briefly + retry from cache
  await new Promise(r => setTimeout(r, 50));
  const cached = await this.redis.get(this.cacheKeyFromLock(lockKey));
  if (cached) return cached as T;
  return factory(); // dernier recours
}
```

> Nécessite exposer le client `ioredis` brut depuis `RedisService`. ~2 h.

#### 7. Worker BullMQ — déploiement séparé

Vérifier sur Render/k8s que `worker.ts` tourne **dans un service séparé** du process API (sinon le worker pollue le pool d'event loop des requêtes HTTP).

```yaml
# render.yaml (extrait)
services:
  - type: web
    name: api-datafriday
    startCommand: node dist/main.js
  - type: worker
    name: worker-datafriday
    startCommand: node dist/worker.js
```

À auditer dans [render.yaml](../render.yaml) actuel.

---

### 🟢 PRIORITÉ BASSE / OBSERVABILITÉ

#### 8. Validation des variables d'env au boot (Joi/Zod)

Ajouter dans `ConfigModule` un schéma de validation pour échouer **au démarrage** si `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` manquent :

```bash
pnpm add joi
```

```ts
import * as Joi from 'joi';

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [...],
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
    DATABASE_URL: Joi.string().uri().required(),
    DIRECT_URL: Joi.string().uri().optional(),
    REDIS_URL: Joi.string().uri().required(),
    JWT_SECRET: Joi.string().min(32).required(),
    ENCRYPTION_KEY: Joi.string().length(64).hex().required(),
    PORT: Joi.number().default(3000),
  }),
  validationOptions: { abortEarly: true, allowUnknown: true },
}),
```

#### 9. Audit indexes Prisma

Lancer pendant un trafic réaliste :

```sql
SELECT schemaname, relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan AND n_live_tup > 1000
ORDER BY seq_scan DESC LIMIT 20;
```

Cibler en priorité :
- `space_revenue_daily_agg(tenantId, spaceId, day)`
- `space_product_revenue_daily_agg(tenantId, spaceId, day)`
- `weezevent_product(id)` ← déjà PK, OK
- toute table avec `orderBy createdAt desc` → `(tenantId, createdAt DESC)`

#### 10. Surveillance / alerting

- Brancher **Sentry** (`@sentry/node`) sur `AllExceptionsFilter` pour les erreurs 5xx + jobs BullMQ failed.
- Métriques Prometheus : `prom-client` + endpoint `/metrics` (déjà mentionné — vérifier).
- Alertes : circuit breaker open > 5 min, taux d'erreur > 1 %, latence p95 > 1 s.

#### 11. Tests de charge avant prod

```bash
# k6 / artillery
pnpm dlx artillery run loadtest/dashboard-100rps.yaml
```

Scénarios à valider :
- 1 000 RPS sur `/dashboard/:spaceId` (vérifier les fix N+1)
- 10 000 connexions simultanées WebSocket/SSE (si applicable)
- circuit breaker s'ouvre quand Weezevent est down

---

## 📊 Impact estimé après ces changements

| Métrique | Avant | Après (sprint 1+2 implémenté) | Cible (manuel restant) |
|----------|-------|--------------------------------|-----------------------|
| Queries / dashboard | ~50 | **~5** ✅ | ~5 |
| Latence p95 dashboard | 1.5–3 s | **300–600 ms** ✅ | < 300 ms |
| Bypass tenantId | théorique | théorique | **0** (après #4) |
| Failover Weezevent | cascade | **fail-fast 30 s** ✅ | + alerting |
| Rate limit cluster | per-pod | per-pod | **partagé** (après #3) |
| Logs ingestion | console | console | **structuré** (après #5) |

---

## 🎯 Checklist de mise en production

- [ ] Variables d'env prod renseignées (#1)
- [ ] `directUrl` Prisma + `prisma migrate deploy` (#2)
- [ ] Throttler Redis storage configuré (#3)
- [ ] Worker BullMQ déployé en service séparé (#7)
- [ ] Smoke test : `/health/detailed` retourne `healthy` pour DB+Redis+Queues
- [ ] Test de charge passé sur l'endpoint dashboard
- [ ] Sentry / monitoring branché (#10)
- [ ] Backup PostgreSQL automatique vérifié
- [ ] Circuit breaker testé en simulation (Weezevent down)
- [ ] HSTS activé (déjà code, confirmer derrière HTTPS uniquement)

---

*Implémentation réalisée le 7 mai 2026. Build TypeScript ✅ vert.*
