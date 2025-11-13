# 📚 Documentation

## Fichiers

### [ARCHITECTURE.md](./ARCHITECTURE.md)
Architecture multi-tenant SaaS, stack technique, modèles de données (27), sécurité RLS, workflow de développement.

### [ENVIRONMENTS.md](./ENVIRONMENTS.md)
Guide complet des 3 environnements Supabase (Development, Staging, Production). Configuration, commandes, workflow, migrations.

### [figma.md](./figma.md)
Données sources extraites de Figma. Référence pour comprendre la structure des données métier.

### [prisma.md](./prisma.md)
Notes et documentation Prisma. Références techniques sur l'ORM.

---

---

## 🚀 Nouveaux Guides (Architecture SaaS Sécurisée)

### [PHASE1_SECURITY.md](./PHASE1_SECURITY.md) ⭐ URGENT
**Sécurité Multi-Tenant - À implémenter MAINTENANT**

Guide complet pour sécuriser l'isolation des tenants :
- RLS Supabase (Row-Level Security)
- Middleware Prisma avec injection automatique tenantId
- JWT Auth avec validation org_id
- Tests de sécurité et validation

**Durée :** 1-2 semaines | **Priorité :** CRITIQUE 🔴

---

### [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) ⭐
**Roadmap complète 4 phases (23 semaines)**

Plan d'action détaillé pour transformer le backend en SaaS production-ready :

- **Phase 1 :** Sécurité Multi-Tenant (1-2 sem) 🔴 URGENT
- **Phase 2 :** Production Ready (2-3 sem) - Cloudflare, CI/CD, observabilité
- **Phase 3 :** Scaling (1-2 mois) - Redis, Prometheus, performance
- **Phase 4 :** Enterprise (2-3 mois) - Kong, K8s, SSO (optionnel)

Sprints détaillés, estimations temps, critères de validation.

---

## 📦 Code Fourni (Prêt à Intégrer)

### Backend (NestJS)

| Fichier | Description | Usage |
|---------|-------------|-------|
| `src/prisma/prisma-tenant.service.ts` | Isolation tenant automatique | Remplace PrismaService |
| `src/common/guards/jwt-tenant.guard.ts` | Guard JWT + validation org_id | `@UseGuards(JwtTenantGuard)` |
| `src/common/middleware/tenant.middleware.ts` | Extraction tenantId du JWT | Apply globalement |
| `src/common/decorators/tenant-scoped.decorator.ts` | `@TenantId()` param decorator | Dans controllers |
| `src/common/decorators/rate-limit.decorator.ts` | `@RateLimit()` presets | Par endpoint |

### Database (Supabase)

| Fichier | Description | Action |
|---------|-------------|--------|
| `supabase/rls-policies.sql` | Policies RLS 15 tables | Exécuter dans SQL Editor |

### Cloudflare

| Fichier | Description | Action |
|---------|-------------|--------|
| `cloudflare/api-shield-config.json` | WAF + Rate limits + Security | Importer dans Dashboard |

---

## Quick Links

- **⚠️ URGENT:** [PHASE1_SECURITY.md](./PHASE1_SECURITY.md) - À faire MAINTENANT
- **📅 Roadmap:** [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)
- **Setup initial:** Voir [ENVIRONMENTS.md](./ENVIRONMENTS.md#setup-initial)
- **Commandes:** `make help` dans le terminal
- **Architecture SaaS:** [ARCHITECTURE.md#architecture-multi-tenant-saas](./ARCHITECTURE.md#architecture-multi-tenant-saas)
- **Modèles:** Voir `../prisma/schema.prisma`

---

## Structure du projet

```
api-datafriday/
├── README.md              ← Documentation principale
├── docs/                  ← Documentation technique
│   ├── ARCHITECTURE.md
│   ├── ENVIRONMENTS.md
│   ├── figma.md
│   └── prisma.md
├── prisma/
│   ├── schema.prisma      ← 27 modèles
│   ├── migrations/
│   └── seed.ts
├── src/
│   └── ...
└── Makefile              ← 50+ commandes
```
