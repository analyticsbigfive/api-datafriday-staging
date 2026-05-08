# 🚀 Deployment Guide (DEV / STAGING / PROD)

Ce document rassemble **tout ce dont vous avez besoin** pour déployer l’API DataFriday.

## 1) Pré-requis

### 1.1 Logiciels

- Docker >= 24.x
- Docker Compose >= 2.x

Optionnel (si déploiement hors Docker):
- Node.js 20.x

### 1.2 Comptes & services externes

- **Supabase** (PostgreSQL + Auth)
- **Redis** (cache + BullMQ) (local via docker-compose ou Redis managé type Upstash)
- (Optionnel) **Weezevent** (si intégration activée)
- (Optionnel) **Cloudflare** (WAF, rate limiting, API shield)

## 2) Vue d’ensemble des composants à déployer

### 2.1 API (NestJS + Fastify)

- Expose: `PORT` (dans le conteneur: 3000)
- Prefix API: `/api/v1`
- Swagger: `/docs`

### 2.2 Base de données

- PostgreSQL via Supabase
- Prisma utilisé côté API
- Migrations Prisma: `prisma/migrations`

### 2.3 Redis

- Utilisé pour:
  - cache distribué (via `RedisService`)
  - queues BullMQ (via `QueueModule`)

### 2.4 Jobs / CRON

- `@nestjs/schedule` actif
- Weezevent CRON: activable/désactivable via `WEEZEVENT_CRON_ENABLED` (par défaut activé si variable absente)

## 3) Variables d’environnement (ENV)

## 3) Variables d'environnement (ENV)

Voir [ENVIRONMENTS.md](./ENVIRONMENTS.md) pour la liste complète des variables et les templates par environnement.

Fichiers ENV : `envFiles/.env.development` / `.env.staging` / `.env.production` (template : `.env.example`)

## 4) Déploiement via Docker Compose (recommandé)

Voir [ENVIRONMENTS.md](./ENVIRONMENTS.md) pour la table complète des commandes make par environnement.

```bash
make dev-up && make dev-logs       # Dev
make staging-up && make staging-migrate  # Staging
make prod-up && make prod-migrate  # Prod
```

## 4bis) Déploiement sans Docker (Node-only)

Objectif: **ne pas compiler TypeScript sur le droplet**, et ne faire sur le droplet que:

- installation des dépendances runtime
- migrations Prisma
- démarrage du process Node

### Où builder (recommandé)

- **CI/CD (GitHub Actions)**: vous buildez sur un runner Linux (Ubuntu), puis vous déployez l’artifact (ou un package) sur le droplet.
- **Machine locale**: possible, mais évitez de copier un `node_modules` généré sur macOS vers un droplet Linux. Si vous buildez localement, ne transférez en général que `dist/` + les fichiers de lock, et laissez le droplet faire `npm ci`.

### Ce que le droplet doit faire (même si on ne “build” pas dessus)

- `npm ci --omit=dev` (installe les dépendances nécessaires à l’exécution)
- `npx prisma generate` (génère le client Prisma pour Linux)
- `npx prisma migrate deploy` (applique les migrations)
- lancer `node dist/main`

### Workflow simple conseillé (CI build -> droplet run)

- **Build en CI**:
  - `npm ci`
  - `npm run build`
  - packager et publier un artifact contenant au minimum: `dist/`, `prisma/`, `package.json`, `package-lock.json`
- **Déploiement sur le droplet**:
  - copier l’artifact dans un dossier versionné (ex: `/opt/datafriday/releases/<timestamp>`)
  - installer deps + prisma generate + migrate deploy
  - redémarrer le process (via `systemd` ou `pm2`)

### Remarque importante sur la config ENV

En dehors de Docker, privilégiez des **variables d’environnement système** (systemd/pm2) ou un fichier `.env` lu par votre process manager.

## 5) Déploiement sur VPS via GHCR (staging)

Le workflow GitHub Actions `deploy-staging.yml`:

- Build & push une image sur GHCR (`ghcr.io/<repo>:staging-latest`)
- SSH sur le serveur
- `docker pull` + `docker-compose -f docker-compose.staging.yml up -d`
- Healthcheck: `GET $STAGING_URL/api/v1/health`

### Secrets nécessaires (GitHub)

- `SSH_PRIVATE_KEY`
- `SSH_HOST`
- `SSH_USER`

Variables (GitHub Environments):
- `STAGING_URL`

## 6) Déploiement sur Render

Deux options:

### 6.1 Via `render.yaml`

- `buildCommand`: `npm install && npx prisma generate && npx @nestjs/cli build`
- `startCommand`: `node dist/main`
- `healthCheckPath`: `/api/v1/health`

### 6.2 Via Deploy Hook

Workflow `deploy-render.yml`:
- appelle `RENDER_DEPLOY_HOOK_URL`

Secrets Render:
- `DATABASE_URL`, `DIRECT_URL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`, `ENCRYPTION_KEY`
- `REDIS_URL`

## 7) Migrations (Prisma)

### 7.1 Générer le client Prisma

Dans Docker (dev):

```bash
docker-compose exec api-dev npx prisma generate
```

En production (dans compose), c’est déjà fait au démarrage.

### 7.2 Appliquer les migrations

Staging/Prod:

```bash
npx prisma migrate deploy
```

Les compose `docker-compose.production.yml` et `docker-compose.staging.yml` exécutent déjà:

```sh
npx prisma migrate deploy && node dist/main
```

## 8) Healthchecks & Monitoring

Endpoints:
- **Public**: `GET /api/v1/health`
- **Détaillé**: `GET /api/v1/health/detailed` (inclut Redis + BullMQ)
- **Swagger**: `GET /docs`

Docker:
- Le `Dockerfile` utilise un `HEALTHCHECK` sur `/api/v1/health`.

## 9) Reverse proxy & TLS (VPS)

Options:
- Nginx (voir `docker-compose.server.yml` profil `with-nginx`)
- Ou load balancer externe

TLS:
- Let’s Encrypt recommandé
- Exposer uniquement 80/443
- L’API peut rester bind sur `127.0.0.1:3000` côté serveur

## 10) Cloudflare (optionnel mais recommandé)

Voir `cloudflare/api-shield-config.json`:
- règles WAF
- rate limiting
- options API Shield

## 11) Checklist de déploiement (PROD)

- [ ] Variables d’env prod configurées (aucun secret en dur)
- [ ] `DATABASE_URL` = pooler Supabase (pgbouncer) recommandé
- [ ] `DIRECT_URL` configurée pour opérations admin/migrations
- [ ] Redis prod (Upstash ou Redis managé) + `REDIS_URL`
- [ ] Migrations Prisma prêtes et testées sur staging
- [ ] `CORS_ORIGIN` strict (domaines autorisés)
- [ ] Weezevent CRON: décider (true/false)
- [ ] Healthcheck OK: `/api/v1/health`
- [ ] Observabilité: logs + alerting

## 12) Troubleshooting

### 12.1 API unhealthy / healthcheck KO

- Vérifier URL: **`/api/v1/health`**
- Vérifier `PORT` et mapping docker
- Vérifier logs `make prod-logs`

### 12.2 Prisma migrate deploy échoue

- Vérifier `DATABASE_URL` / `DIRECT_URL`
- Vérifier que la DB Supabase n’est pas en pause
- Vérifier l’état des migrations:

```bash
npx prisma migrate status
```

### 12.3 Redis non accessible

- Vérifier `REDIS_URL`
- Vérifier que Redis tourne et est reachable depuis l’API
- Tester `/api/v1/health/detailed`

### 12.4 Weezevent CRON

- Désactiver temporairement:

```env
WEEZEVENT_CRON_ENABLED=false
```

---

## Références

- `.env.example`
- `docker-compose*.yml`
- `render.yaml`
- `docs/getting-started/ENVIRONMENTS.md`
- `docs/architecture/SUPABASE.md`
- `docs/getting-started/DOCKER_QUICKSTART.md`
