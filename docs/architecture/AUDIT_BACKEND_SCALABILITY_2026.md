# 🔍 Audit Backend API — Sécurité, Performance, Scalabilité

**Date :** 7 mai 2026
**Cible :** > 10 000 utilisateurs concurrents
**Périmètre :** API NestJS (`api-datafriday-staging`)
**Stack :** NestJS 10 + Fastify + Prisma + Supabase + Redis + BullMQ

---

## 📌 Résumé exécutif

L'architecture est **saine** (multi-tenant, Redis cache, BullMQ, encryption AES-256-GCM, indexes Prisma, rate-limiting par tenant). Cependant, **3 points CRITIQUES** doivent être corrigés avant la mise à l'échelle, et plusieurs optimisations HIGH/MEDIUM sont nécessaires pour tenir 10 000+ utilisateurs sans dégradation.

**Score actuel estimé :** 7/10 → **objectif post-correctifs : 9.5/10**

| Sévérité | Nombre | Effort total |
|----------|--------|--------------|
| 🔴 CRITICAL | 3 | ~3 h |
| 🟠 HIGH | 5 | ~6 h |
| 🟡 MEDIUM | 5 | ~10 h |
| 🟢 LOW | 3 | ~1.5 h |

---

## 🔴 CRITIQUE — À corriger immédiatement

### C1. `envFilePath` hardcodé sur `.env.development` → casse la production

**Fichier :** [src/app.module.ts](../src/app.module.ts#L33)

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: 'envFiles/.env.development',  // ❌
}),
```

**Impact :** En production le fichier n'existe pas dans le container → `process.env` partiel → secrets DB/Redis/Weezevent absents → comportement imprévisible.

**Correctif :**

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [
    `envFiles/.env.${process.env.NODE_ENV || 'development'}`,
    '.env',
  ],
  expandVariables: true,
  validationOptions: { allowUnknown: true, abortEarly: true },
}),
```

---

### C2. N+1 queries dans le dashboard espaces

**Fichier :** [src/features/spaces/services/space-dashboard.service.ts](../src/features/spaces/services/space-dashboard.service.ts)

**Pattern A (lignes ~509-520) — `await` dans un `for` :**

```ts
for (const data of shopData) {
  const element = await this.prisma.spaceElement.findUnique({
    where: { id: data.spaceElementId },
  }); // ❌ 1 query par ligne (~30+/req)
}
```

**Pattern B (ligne ~618) — `Promise.all(map(async findUnique))` :**

```ts
const topProductsWithNames = await Promise.all(
  topProducts.map(async (p) => {
    const prod = await this.prisma.weezeventProduct.findUnique({ where: { id: p.weezeventProductId } });
    return { ...p, name: prod?.name };
  }),
); // ❌ Toujours N requêtes (parallèles mais N)
```

**Impact à 10 k utilisateurs :** une requête dashboard ≈ 30-100 sous-requêtes Prisma → saturation pool DB (typiquement 10-20 connexions Supabase) → file d'attente → timeouts en cascade.

**Correctif (batch + Map) :**

```ts
const ids = [...new Set(shopData.map(d => d.spaceElementId).filter(Boolean))];
const elements = await this.prisma.spaceElement.findMany({
  where: { id: { in: ids } },
  select: { id: true, name: true },
});
const byId = new Map(elements.map(e => [e.id, e.name]));
for (const data of shopData) {
  const name = byId.get(data.spaceElementId) ?? 'Unknown';
  // ...
}
```

➡️ **Action :** auditer également `aggregation`, `analyse`, `mappings`, `weezevent` services pour des patterns équivalents (`grep -rn "for .* await this.prisma" src/` et `Promise.all.*findUnique`).

---

### C3. CSP autorise `'unsafe-inline'` → risque XSS

**Fichier :** [src/main.ts](../src/main.ts#L24-L31)

```ts
styleSrc: ["'self'", "'unsafe-inline'"],
scriptSrc: ["'self'", "'unsafe-inline'"],
```

**Correctif :** retirer `'unsafe-inline'`, utiliser des hashes/nonces, restreindre `connectSrc` à l'origine API + Weezevent.

```ts
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", process.env.WEEZEVENT_API_URL ?? 'https://api.weezevent.com'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
},
referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
```

---

## 🟠 HIGH — À corriger avant montée en charge

### H1. Helmet & compression branchés en middleware Express sur Fastify

**Fichier :** [src/main.ts](../src/main.ts#L21-L37)

`app.use(helmet(...))` et `app.use(compression(...))` passent par la couche de compatibilité Express → +5-10 % de latence + perte de bénéfices Fastify.

**Correctif :** utiliser les plugins Fastify natifs.

```bash
pnpm add @fastify/helmet @fastify/compress
```

```ts
await app.register(import('@fastify/helmet'), { contentSecurityPolicy: { /* ... */ } });
await app.register(import('@fastify/compress'), { threshold: 1024, encodings: ['gzip', 'br'] });
```

---

### H2. Pas de `enableShutdownHooks()` ni de SIGTERM gracieux

**Risques :** jobs BullMQ tués en cours, sockets DB/Redis non fermées, requêtes en vol coupées → corruption partielle.

**Correctif (`main.ts`) :**

```ts
app.enableShutdownHooks();

const signals = ['SIGTERM', 'SIGINT'] as const;
for (const sig of signals) {
  process.on(sig, async () => {
    Logger.log(`${sig} reçu — arrêt gracieux`);
    await app.close(); // ferme HTTP, hooks Prisma, BullMQ, Redis
    process.exit(0);
  });
}
```

S'assurer que `PrismaService`, `RedisService`, `QueueService` implémentent `OnModuleDestroy` avec `$disconnect()` / `quit()`.

---

### H3. Conflit de stratégies JWT — risque d'auth bypass

**Fichiers :** [src/core/auth/strategies/jwt.strategy.ts](../src/core/auth/strategies/jwt.strategy.ts), [jwt-db-lookup.strategy.ts](../src/core/auth/strategies/jwt-db-lookup.strategy.ts)

Deux stratégies cohabitent (legacy `org_id` vs nouvelle DB-lookup). Si la mauvaise est sélectionnée, `tenantId` peut être `undefined` → fuite cross-tenant possible.

**Correctif :**
1. Supprimer `JwtStrategy` legacy.
2. `defaultStrategy: 'jwt-db'` exclusivement.
3. Ajouter une garde de secours dans `tenant.interceptor.ts` qui **rejette** toute requête où `req.user.tenantId` est falsy.

---

### H4. Pas de circuit breaker sur Weezevent

**Fichier :** [src/features/weezevent/services/weezevent-api.service.ts](../src/features/weezevent/services/weezevent-api.service.ts)

Si l'API Weezevent tombe : 10 000 utilisateurs × 3 retries × backoff = ~30 000 requêtes inutiles → DDoS involontaire + saturation worker pool.

**Correctif :** `opossum` (circuit breaker) avec `errorThresholdPercentage: 50`, `resetTimeout: 30000`. Renvoyer `503` immédiat quand le breaker est ouvert.

```ts
this.breaker = new CircuitBreaker(
  (cfg) => this.httpService.axiosRef.request(cfg),
  { timeout: 15000, errorThresholdPercentage: 50, resetTimeout: 30_000 },
);
```

---

### H5. Timeout HTTP non garanti

Le `request()` Weezevent étale `...options` après le timeout par défaut → un appelant peut accidentellement passer un timeout > 15 s.

**Correctif :** appliquer le timeout **après** le spread.

```ts
const config: AxiosRequestConfig = {
  method, url: `${this.baseUrl}${endpoint}`,
  headers: { /* ... */ },
  ...options,
  timeout: Math.min(options.timeout ?? 15_000, 15_000), // ✅ plafond ferme
};
```

---

## 🟡 MEDIUM — Optimisations 10 k+

### M1. Cache stampede sur la résolution user/tenant

**Fichier :** [src/core/auth/strategies/jwt-db-lookup.strategy.ts](../src/core/auth/strategies/jwt-db-lookup.strategy.ts)

À l'expiration du TTL (60 s), des milliers de requêtes simultanées passent au DB. Le `pendingLookups` Map local ne couvre **qu'une instance** ; en cluster (k8s/Render), chaque pod refait la requête.

**Correctif :** lock distribué Redis (`SET NX EX`) pour sérialiser le « cache fill », sinon early-return + `setTimeout` court côté followers.

---

### M2. Webhooks sortants — pas d'anti-replay côté receveur, et signing only

**Fichier :** [src/core/webhooks/webhooks.service.ts](../src/core/webhooks/webhooks.service.ts)

Ajouter dans le payload signé :
- `timestamp` (rejet > 5 min)
- `nonce` (id stocké en Redis 24 h)
- inclure le **timestamp dans le HMAC** pour empêcher les altérations

Côté webhooks **entrants** (s'il y en a depuis Weezevent) : valider la signature + nonce avant d'enqueuer.

---

### M3. Body size limit absente

**Fichier :** [src/main.ts](../src/main.ts)

Risque DoS mémoire (POST géants).

```ts
new FastifyAdapter({
  bodyLimit: 5 * 1024 * 1024, // 5 MB
  trustProxy: true,           // requis derrière LB/CDN pour Real-IP & rate-limit
}),
```

Et `ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true })`.

---

### M4. Observabilité — corrélation et logs structurés

- Pas de `X-Correlation-ID` propagé entre HTTP / queue / webhooks / Prisma.
- `console.log()` non structuré → ingestion impossible (Datadog/Loki/Grafana).

**Correctif :**
- `nestjs-pino` + `AsyncLocalStorage` pour propager le correlation id (jusque dans les jobs BullMQ).
- Champs systématiques : `tenantId`, `userId`, `requestId`, `route`, `latencyMs`.
- Exposer `/metrics` Prometheus (déjà partiellement fait — vérifier la couverture).

---

### M5. Slow query log + index review

**Fichier :** [src/core/database/prisma.service.ts](../src/core/database/prisma.service.ts)

En prod, logguer uniquement les requêtes > 500 ms :

```ts
this.$on('query' as never, (e: any) => {
  if (e.duration > 500) this.logger.warn(`SLOW(${e.duration}ms) ${e.query}`);
});
```

À auditer dans `prisma/schema.prisma` :
- toutes les colonnes filtrées (`tenantId`, `eventId`, `spaceElementId`, `weezeventProductId`, `createdAt`) doivent avoir un `@@index` composite incluant `tenantId` en tête.
- vérifier les `orderBy createdAt desc` paginés → besoin d'index `(tenantId, createdAt DESC)`.

---

## 🟢 LOW — Confort & qualité

### L1. Health check : ajouter Prisma

```ts
await this.prisma.$queryRaw`SELECT 1`;
```

Renvoyer `503` si DB ou Redis KO (orchestrateurs k8s/Render réagissent correctement).

### L2. Validation production des variables d'env

Ajouter Joi/Zod schema dans `ConfigModule` pour échouer **au boot** si `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY` manquent.

### L3. CORS — supprimer `origin: true` même hors prod si l'API expose des cookies (`credentials: true` + wildcard = comportement non sûr selon les navigateurs).

---

## 📦 Pool de connexions Prisma / Supabase

À 10 k utilisateurs :
- Prisma par défaut ouvre `num_physical_cpus * 2 + 1` connexions.
- **Supabase free** = ~60 connexions max ; **paid** ≥ 200 mais via PgBouncer recommandé.

**Actions :**
1. Connecter via PgBouncer (URL `?pgbouncer=true&connection_limit=1` côté Prisma serverless ; `connection_limit=20` côté long-running).
2. Activer `?statement_cache_size=0` si PgBouncer en mode transaction.
3. Configurer `DATABASE_URL` (pool runtime) **et** `DIRECT_URL` (migrations) dans `schema.prisma`.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## 🚦 Throttling à 10 k+ utilisateurs

`tenant-throttler.guard.ts` : confirmer que le **storage** est `ThrottlerStorageRedisService` (sinon en mémoire = inefficace en cluster).

```ts
ThrottlerModule.forRootAsync({
  useFactory: (redis: RedisService) => ({
    throttlers: [
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 300 },
      { name: 'long', ttl: 3_600_000, limit: 5_000 },
    ],
    storage: new ThrottlerStorageRedisService(redis.client),
  }),
  inject: [RedisService],
}),
```

Limites suggérées par tenant pour 10 k+ : burst 50/s, 1 000/min, 20 000/h (à ajuster selon profil dashboard vs sync).

---

## 🧵 BullMQ / Worker

**Vérifications recommandées :**
- `concurrency` worker adapté au CPU (souvent 5–10 par worker).
- Idempotency key (`jobId`) sur les syncs Weezevent par `(tenantId, eventId)` pour éviter doublons.
- `removeOnComplete: { age: 3600, count: 1000 }` et `removeOnFail: { age: 86400 }` pour ne pas exploser Redis.
- DLQ + alerting Sentry/Datadog quand `attemptsMade === maxAttempts`.
- Worker process **séparé** du process API (déjà prévu via `worker.ts`) — confirmer le déploiement (Render: 2 services).

---

## 🛡️ Récap conformité OWASP Top 10

| OWASP | État | Action |
|-------|------|--------|
| A01 Broken Access Control | ⚠️ | Fix H3 (JWT), garde anti-`tenantId` undefined |
| A02 Crypto Failures | ✅ | AES-256-GCM en place |
| A03 Injection | ✅ | Prisma + DTO (renforcer `forbidNonWhitelisted`) |
| A04 Insecure Design | ⚠️ | Ajouter circuit breaker (H4) |
| A05 Security Misconfig | 🔴 | Fix C1 (env), C3 (CSP), M3 (body limit) |
| A06 Vulnerable Components | ✅ | Versions récentes — `pnpm audit` à automatiser |
| A07 Auth & Identity | ⚠️ | Fix H3 |
| A08 Data Integrity | ⚠️ | Webhooks anti-replay (M2) |
| A09 Logging & Monitoring | ⚠️ | M4 (correlation, logs structurés) |
| A10 SSRF | ✅ | URLs externes whitelisted (Weezevent) |

---

## 🚀 Plan d'implémentation conseillé

**Sprint 1 (production-ready) — ~1 jour**
1. C1 — `envFilePath` dynamique
2. C3 — CSP durci
3. M3 — `bodyLimit`, `forbidNonWhitelisted`, `trustProxy`
4. H2 — `enableShutdownHooks()` + handlers SIGTERM
5. L2 — validation env vars au boot

**Sprint 2 (résilience) — ~2 jours**
6. C2 — refonte N+1 (dashboard, aggregation, analyse)
7. H1 — bascule `@fastify/helmet` + `@fastify/compress`
8. H3 — nettoyage stratégies JWT + garde tenantId
9. H5 — verrou de timeout HTTP

**Sprint 3 (scalabilité) — ~3 jours**
10. H4 — circuit breaker Weezevent
11. M1 — lock distribué cache stampede
12. Throttler storage Redis confirmé + ajustements
13. PgBouncer + `directUrl` Prisma

**Sprint 4 (observabilité) — ~2 jours**
14. M4 — `nestjs-pino` + correlation id (HTTP + jobs)
15. M5 — slow query log + audit indexes Prisma
16. L1 — health check DB
17. M2 — anti-replay webhooks

---

## ✅ Points déjà solides (à conserver)

- Encryption AES-256-GCM des secrets tenants
- Multi-tenant via interceptor + indexes composites
- Rate limiting par tenant (3 fenêtres)
- BullMQ avec retries et idempotence partielle
- Cache auth Redis (TTL 60 s)
- Batch refresh costs (15 k → 3 queries)
- Sync Weezevent parallélisée
- Compression responses
- Swagger documenté

---

*Document généré le 7 mai 2026. À mettre à jour après chaque sprint.*
