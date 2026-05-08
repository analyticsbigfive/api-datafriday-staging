# Documentation DataFriday API

> **Architecture:** HEOS | **Dernière mise à jour:** mai 2026

---

## Structure

```
docs/
├── INDEX.md                               ← Vous êtes ici
│
├── getting-started/                       ← DÉMARRAGE
│   ├── DEPLOYMENT.md                      ← Déploiement staging/prod
│   ├── DEVELOPMENT.md                     ← Guide développeur
│   ├── ENVIRONMENTS.md                    ← Config par environnement (référence)
│   ├── DOCKER_QUICKSTART.md               ← Docker (5 min)
│   └── HEOS_QUICKSTART.md                 ← BullMQ/Redis HEOS (5 min)
│
├── architecture/                          ← ARCHITECTURE
│   ├── ARCHITECTURE.md                    ← Vue d'ensemble + Prisma
│   ├── AUDIT_BACKEND_SCALABILITY_2026.md  ← Audit technique mai 2026
│   ├── AUDIT_IMPLEMENTATION_2026.md       ← Fixes appliqués + actions pending
│   ├── HEOS_ARCHITECTURE_GUIDE.md         ← Système HEOS (référence)
│   ├── SECURITY_BEST_PRACTICES.md         ← Sécurité frontend/Supabase
│   └── SUPABASE.md                        ← CLI Supabase, linking
│
├── api/                                   ← RÉFÉRENCE API
│   ├── API_REFERENCE.md                   ← Tous les endpoints
│   ├── API_VERSIONING.md                  ← Stratégie versioning
│   ├── FRONTEND_API_GUIDE.md              ← Intégration frontend (Axios, JWT)
│   ├── FRONTEND_MENU_COMPOSITION_API.md   ← API composition menus
│   ├── HTTP_ERROR_CODES.md                ← Référence codes HTTP + Prisma
│   ├── INGREDIENT_MARKETPRICE_CLARIFICATION.md ← Modèle domaine
│   └── SPACES_API_GUIDE.md                ← API Spaces
│
├── auth/                                  ← AUTHENTIFICATION
│   ├── AUTH_TESTING_GUIDE.md              ← Tests auth step-by-step
│   └── MULTI_TENANT.md                    ← Guards, décorateurs multi-tenant
│
├── events/
│   └── FRONTEND_HANDOFF_CURL_EVENTS.md    ← Curl/payloads events
│
├── spaces/
│   ├── SHOPS_SYSTEM.md                    ← Architecture système shops
│   └── SPACE_DASHBOARD_UNIFIED_API.md     ← Spec GET /spaces/:id/dashboard
│
├── testing/
│   └── SPACES_TESTING_GUIDE.md            ← QA manuel Spaces
│
├── weezevent/                             ← INTÉGRATION WEEZEVENT
│   ├── FRONTEND_HANDOFF_CURL_WEEZEVENT.md ← Curl/payloads complets
│   ├── WEEZEVENT_ANALYTICS.md             ← Requêtes analytics Prisma
│   ├── WEEZEVENT_API_CLIENT_USAGE.md      ← Usage WeezeventClientService
│   ├── WEEZEVENT_DATA_MAPPING.md          ← Transaction JSON → Prisma
│   ├── WEEZEVENT_FNB_MAPPING.md           ← Mapping → fnb_sales_raw
│   ├── WEEZEVENT_PERFORMANCE_GUIDE.md     ← Index, cache patterns
│   ├── WEEZEVENT_SYNC_OPERATIONS.md       ← Opérations sync (référence actuelle)
│   ├── WEEZEVENT_TESTING_GUIDE.md         ← Tests unitaires Docker
│   ├── WEEZEVENT_WEBHOOK_QUICKSTART.md    ← Setup webhook (5 min)
│   └── WEEZEVENT_WEBHOOK_SETUP.md         ← Setup webhook complet (HMAC)
│
└── SPACE_MENUS_EXAMPLE.json               ← Exemple payload API
```

---

## Démarrage rapide

```bash
cp .env.example envFiles/.env.development
make dev-up
curl http://localhost:3000/api/v1/health
```

```bash
make dev-up       # Démarrer en dev
make dev-logs     # Voir les logs
make dev-studio   # Prisma Studio
make dev-down     # Arrêter
make test         # Lancer les tests
```

---

## Architecture HEOS

> **HEOS** = Hybrid Event-driven Orchestrated System

```
Client → NestJS (Orchestrateur) → Dispatch intelligent
                │
                ├─→ Simple     → Prisma direct (< 50ms)
                ├─→ Cache      → Redis (< 10ms)
                ├─→ Analytics  → Materialized Views (< 50ms)
                ├─→ Calculs    → Edge Functions (< 500ms)
                └─→ Jobs longs → BullMQ (async)
```

Référence : [architecture/HEOS_ARCHITECTURE_GUIDE.md](architecture/HEOS_ARCHITECTURE_GUIDE.md)

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Backend** | NestJS 10 + Fastify |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL (Supabase) |
| **Cache** | Redis |
| **Queue** | BullMQ |
| **Auth** | JWT + Supabase Auth |
| **Edge** | Supabase Edge Functions |
| **CDN** | Cloudflare |

---

## Par rôle

| Rôle | Par où commencer |
|------|-----------------|
| **Nouveau dev** | [ENVIRONMENTS](getting-started/ENVIRONMENTS.md) → [DEVELOPMENT](getting-started/DEVELOPMENT.md) |
| **Frontend** | [FRONTEND_API_GUIDE](api/FRONTEND_API_GUIDE.md) → [API_REFERENCE](api/API_REFERENCE.md) |
| **DevOps** | [ENVIRONMENTS](getting-started/ENVIRONMENTS.md) → [DEPLOYMENT](getting-started/DEPLOYMENT.md) |
| **Architecte** | [ARCHITECTURE](architecture/ARCHITECTURE.md) → [HEOS](architecture/HEOS_ARCHITECTURE_GUIDE.md) |
| **Weezevent** | [WEEZEVENT_SYNC_OPERATIONS](weezevent/WEEZEVENT_SYNC_OPERATIONS.md) → [WEEZEVENT_ANALYTICS](weezevent/WEEZEVENT_ANALYTICS.md) |

---

## Par fonctionnalité

| Fonctionnalité | Document |
|----------------|----------|
| Auth multi-tenant | [auth/MULTI_TENANT.md](auth/MULTI_TENANT.md) |
| Weezevent sync | [weezevent/WEEZEVENT_SYNC_OPERATIONS.md](weezevent/WEEZEVENT_SYNC_OPERATIONS.md) |
| Weezevent analytics | [weezevent/WEEZEVENT_ANALYTICS.md](weezevent/WEEZEVENT_ANALYTICS.md) |
| API Spaces | [api/SPACES_API_GUIDE.md](api/SPACES_API_GUIDE.md) |
| Webhooks | [weezevent/WEEZEVENT_WEBHOOK_SETUP.md](weezevent/WEEZEVENT_WEBHOOK_SETUP.md) |
| Gestion erreurs | [api/HTTP_ERROR_CODES.md](api/HTTP_ERROR_CODES.md) |

---

*Documentation DataFriday API — Architecture HEOS — mai 2026*
