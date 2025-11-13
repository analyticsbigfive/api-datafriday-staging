# 🗺️ ROADMAP D'IMPLÉMENTATION - DataFriday SaaS

**Basé sur l'analyse architecture fournie**

---

## Vue d'ensemble des Phases

| Phase | Focus | Durée | Priorité | Statut |
|-------|-------|-------|----------|--------|
| **Phase 0** | Fondations | ✅ Fait | - | Complété |
| **Phase 1** | Sécurité Multi-Tenant | 1-2 sem | 🔴 URGENT | À faire |
| **Phase 2** | Production Ready | 2-3 sem | 🟡 Haute | À planifier |
| **Phase 3** | Scaling & Performance | 1-2 mois | 🟢 Moyenne | Backlog |
| **Phase 4** | Enterprise Features | 2-3 mois | ⚪ Basse | Optionnel |

---

## Phase 0 - Fondations ✅ COMPLÉTÉ

### Ce qui existe déjà :

- ✅ NestJS + Prisma + Supabase Postgres
- ✅ Modèle multi-tenant (table `Tenant` + `tenantId` sur modèles)
- ✅ Schema Prisma complet (15+ tables)
- ✅ Docker 100% (dev, staging, prod)
- ✅ 3 environnements Supabase configurés
- ✅ Makefile avec commandes par environnement

### Gaps identifiés :

- ❌ RLS Supabase non activé
- ❌ Auth JWT non implémentée
- ❌ Middleware Prisma tenant absent
- ❌ Aucune observabilité
- ❌ Rate limiting absent

---

## Phase 1 - SÉCURITÉ MULTI-TENANT 🔴 URGENT

**Durée :** 1-2 semaines  
**Priorité :** CRITIQUE  
**Objectif :** Bloquer toutes fuites de données entre tenants

### Sprint 1.1 - RLS Supabase (3-4 jours)

#### Tasks :

- [ ] **Appliquer RLS policies** (`supabase/rls-policies.sql`)
  - Activer RLS sur 15 tables
  - Créer policies SELECT/INSERT/UPDATE/DELETE
  - Tester avec `current_setting('request.jwt.claims')`
- [ ] **Vérifier policies dans Dashboard Supabase**
- [ ] **Tests manuels isolation** (SQL queries avec différents org_id)
- [ ] **Documenter procédure RLS** pour staging/prod

**Livrables :**
- RLS activé sur toutes tables
- Tests de validation SQL
- Doc procédure déploiement

---

### Sprint 1.2 - Middleware Prisma (3-4 jours)

#### Tasks :

- [ ] **Créer `PrismaTenantService`** avec REQUEST scope
- [ ] **Implémenter middleware `$use`** pour injection tenantId
- [ ] **Gérer modèles directs** (User, Space, Supplier, Tenant)
- [ ] **Gérer modèles indirects** (Config via Space, Product via Supplier)
- [ ] **Ajouter claim PostgreSQL** pour RLS (`set_config`)
- [ ] **Tests unitaires** middleware

**Livrables :**
- `src/prisma/prisma-tenant.service.ts`
- Tests unitaires 80%+ coverage
- Documentation utilisation

---

### Sprint 1.3 - JWT Auth + Guards (4-5 jours)

#### Tasks :

- [ ] **Implémenter Passport JWT strategy**
- [ ] **Créer `JwtTenantGuard`** avec validation org_id
- [ ] **Créer `TenantMiddleware`** pour extraction tenantId
- [ ] **Decorator `@TenantId()`** pour controllers
- [ ] **Decorator `@Public()`** pour routes publiques
- [ ] **Auth module complet** (login, register, refresh)
- [ ] **Tests e2e authentication**

**Livrables :**
- Module Auth fonctionnel
- Guards + decorators
- Tests e2e isolation tenants

---

### Validation Phase 1 :

**Critères de sortie :**

```bash
# Test 1 : RLS actif
SELECT count(*) FROM pg_policies WHERE schemaname='public';
# Résultat attendu : 50+ policies

# Test 2 : Isolation tenants
curl -H "Authorization: Bearer $TENANT_A_TOKEN" /api/v1/spaces
# Ne doit retourner QUE les spaces de tenant A

# Test 3 : Impossible de bypass
curl -X POST -H "Authorization: Bearer $TENANT_A_TOKEN" \
  -d '{"name":"Space","tenantId":"tenant-b"}' /api/v1/spaces
# tenantId doit être forcé à tenant-a
```

**Documentation :** `docs/PHASE1_SECURITY.md`

---

## Phase 2 - PRODUCTION READY 🟡 HAUTE

**Durée :** 2-3 semaines  
**Priorité :** Haute (blocker pour go-live)  
**Objectif :** API déployable en production sécurisée

### Sprint 2.1 - Cloudflare Edge (5 jours)

#### Tasks :

- [ ] **Setup domaine** (api.datafriday.com)
- [ ] **Cloudflare DNS + Proxy orange**
- [ ] **WAF rules** (SQL injection, XSS, path traversal)
- [ ] **Rate limiting global** (1000 req/min per IP)
- [ ] **Rate limiting auth** (5 req/min pour /auth/*)
- [ ] **API Shield JWT validation** (optionnel)
- [ ] **Security headers** (HSTS, X-Frame-Options, CSP)
- [ ] **Tests charge** avec artillery/k6

**Livrables :**
- Cloudflare configuré
- Config `cloudflare/api-shield-config.json`
- Tests de charge validés

---

### Sprint 2.2 - Rate Limiting NestJS (3 jours)

#### Tasks :

- [ ] **Installer `@nestjs/throttler`**
- [ ] **Config globale** rate limits
- [ ] **Decorator `@RateLimit`** per-endpoint
- [ ] **Presets** (AUTH, PUBLIC, STANDARD, HEAVY)
- [ ] **Redis backend** pour rate limiting distribué
- [ ] **Tests** rate limiting

**Livrables :**
- Rate limiting applicatif
- Decorators prêts à l'emploi
- Tests validation limites

---

### Sprint 2.3 - Observabilité Basique (4 jours)

#### Tasks :

- [ ] **Sentry** pour error tracking
  - Créer projet Sentry
  - Intégrer SDK NestJS
  - Breadcrumbs + context enrichment
- [ ] **Logs structurés** (Winston/Pino)
  - JSON logs avec tenantId, userId, requestId
  - Levels par environnement
- [ ] **Health checks** avancés
  - `/health` - Liveness
  - `/health/ready` - Readiness
  - `/health/db` - Database check
- [ ] **Prometheus metrics** (optionnel)

**Livrables :**
- Sentry configuré avec alertes
- Logs structurés JSON
- Health checks complets

---

### Sprint 2.4 - CI/CD (5 jours)

#### Tasks :

- [ ] **GitHub Actions workflow**
  - Lint + tests sur PR
  - Build Docker image
  - Push sur registry (GHCR/Docker Hub)
- [ ] **Migrations automatisées**
  - Prisma migrate deploy dans CI
  - Rollback strategy
- [ ] **Déploiement staging automatique** (merge main)
- [ ] **Déploiement prod manuel** (tag release)
- [ ] **Secrets management** (GitHub Secrets)

**Livrables :**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`

---

### Sprint 2.5 - Backups Supabase (2 jours)

#### Tasks :

- [ ] **Point-in-time recovery** activé (Supabase Dashboard)
- [ ] **Daily backups** automatiques (Supabase)
- [ ] **Backup script custom** (pg_dump vers S3)
- [ ] **Restore procedure** documentée
- [ ] **Test restore** sur staging

**Livrables :**
- Backups quotidiens automatiques
- Script restore documenté
- Test de restore validé

---

### Validation Phase 2 :

**Critères go-live production :**

- [x] Cloudflare devant API (WAF + rate limits)
- [x] RLS + middleware tenant actifs
- [x] Sentry error tracking
- [x] Logs centralisés
- [x] CI/CD déploiement staging/prod
- [x] Backups quotidiens testés
- [x] Health checks fonctionnels
- [x] Load test validé (1000 req/s)

---

## Phase 3 - SCALING & PERFORMANCE 🟢 MOYENNE

**Durée :** 1-2 mois  
**Objectif :** Supporter croissance et optimiser coûts

### Sprint 3.1 - Redis Cache + Queues (1 sem)

#### Tasks :

- [ ] **Redis déployé** (Upstash/Redis Cloud)
- [ ] **Cache strategy** (menu, config, user sessions)
- [ ] **BullMQ job queue** (emails, rapports, webhooks)
- [ ] **Cache invalidation** per-tenant
- [ ] **Job monitoring** (Bull Board)

---

### Sprint 3.2 - PgBouncer Connection Pooling (3 jours)

#### Tasks :

- [ ] **PgBouncer sidecar** dans Docker/K8s
- [ ] **Config pooling** (transaction mode)
- [ ] **Migration DATABASE_URL** vers pooler
- [ ] **Tests charge** (connections)

---

### Sprint 3.3 - Prometheus + Grafana (1 sem)

#### Tasks :

- [ ] **Prometheus exporters** (NestJS metrics)
- [ ] **Grafana dashboards** (API latency, errors, throughput)
- [ ] **Alerting rules** (p95 > 500ms, error rate > 1%)
- [ ] **On-call rotation** setup

---

### Sprint 3.4 - Performance Tuning (1 sem)

#### Tasks :

- [ ] **DB indices** (organisation_id, dateStart, productId)
- [ ] **Slow query analysis** (pg_stat_statements)
- [ ] **Materialized views** pour analytics
- [ ] **Read replicas** pour rapports lourds
- [ ] **N+1 queries** elimination

---

## Phase 4 - ENTERPRISE FEATURES ⚪ OPTIONNELLE

**Durée :** 2-3 mois  
**Objectif :** Fonctionnalités pour gros clients

### Features :

- [ ] **Kong API Gateway** (si microservices multiples)
- [ ] **Kubernetes deployment** avec HPA
- [ ] **DB per tenant** pour très gros clients
- [ ] **SSO/SAML** (Okta, Azure AD)
- [ ] **SCIM provisioning** (auto user sync)
- [ ] **Advanced RBAC** (fine-grained permissions)
- [ ] **Audit logs immutables** (compliance)
- [ ] **Custom SLA contracts** par tenant
- [ ] **Multi-region** déploiement

---

## 📊 Estimation Budget Temps

| Phase | Dev Weeks | DevOps Weeks | Total |
|-------|-----------|--------------|-------|
| Phase 1 | 2 | 0 | 2 sem |
| Phase 2 | 2 | 1 | 3 sem |
| Phase 3 | 4 | 2 | 6 sem |
| Phase 4 | 8 | 4 | 12 sem |
| **TOTAL** | **16** | **7** | **23 sem** |

---

## 🎯 Recommandation Immédiate

### Prochaines 48h :

1. **Appliquer RLS Supabase** (`supabase/rls-policies.sql`) ← CRITIQUE
2. **Tester isolation** manuellement dans SQL Editor
3. **Créer branch `feature/phase1-security`**

### Cette semaine :

1. Implémenter `PrismaTenantService` 
2. Créer `JwtTenantGuard` + `TenantMiddleware`
3. Tests e2e isolation tenants

### Ce mois :

1. Finir Phase 1 (sécurité)
2. Démarrer Phase 2 (Cloudflare + observabilité)
3. Planifier go-live staging

---

## 📚 Documentation Créée

- ✅ `supabase/rls-policies.sql` - Policies RLS complètes
- ✅ `src/prisma/prisma-tenant.service.ts` - Middleware tenant
- ✅ `src/common/guards/jwt-tenant.guard.ts` - Guard JWT+Tenant
- ✅ `src/common/middleware/tenant.middleware.ts` - Extraction tenantId
- ✅ `src/common/decorators/tenant-scoped.decorator.ts` - Decorators
- ✅ `src/common/decorators/rate-limit.decorator.ts` - Rate limiting
- ✅ `cloudflare/api-shield-config.json` - Config Cloudflare
- ✅ `docs/PHASE1_SECURITY.md` - Guide Phase 1
- ✅ `docs/IMPLEMENTATION_ROADMAP.md` - Ce fichier

---

## 🆘 Support

**Questions Phase 1 :** Voir `docs/PHASE1_SECURITY.md`  
**Questions Architecture :** Voir analyse fournie  
**Troubleshooting :** `TROUBLESHOOTING.md`

**Prêt à démarrer Phase 1 !** 🚀
