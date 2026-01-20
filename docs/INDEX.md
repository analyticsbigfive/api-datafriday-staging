# 📚 Documentation DataFriday API

> **Version:** 2.0 | **Architecture:** HEOS | **Dernière mise à jour:** 20 janvier 2026

---

## 🗂️ Structure de la Documentation

```
docs/
├── 📖 INDEX.md                    ← Vous êtes ici
├── 📖 README.md                   ← Introduction
├── 📊 ANALYSE_PROJET.md           ← Analyse complète
├── 📋 RESUME_EXECUTIF.md          ← Résumé pour décideurs
│
├── 🚀 getting-started/            ← DÉMARRAGE
│   ├── SETUP.md                   ← Installation
│   ├── DEVELOPMENT.md             ← Guide développeur
│   └── ENVIRONMENTS.md            ← Environnements
│
├── 🏗️ architecture/               ← ARCHITECTURE HEOS
│   ├── ARCHITECTURE.md            ← Vue d'ensemble
│   ├── HEOS_ARCHITECTURE_GUIDE.md ← ⭐ Guide HEOS complet
│   ├── HYBRID_ARCHITECTURE.md     ← NestJS + Edge Functions
│   ├── SCALABLE_ARCHITECTURE.md   ← Haute performance
│   ├── PERFORMANCE_BENCHMARKS.md  ← Benchmarks
│   ├── COST_OPTIMIZATION.md       ← Optimisation coûts
│   ├── VPS_VS_CLOUD_COMPARISON.md ← VPS vs Cloud
│   ├── DATABASE.md                ← Schéma BDD
│   ├── API_ARCHITECTURE.md        ← Design API
│   ├── DATA_SOURCES.md            ← Sources données
│   └── SUPABASE.md                ← Config Supabase
│
├── 📡 api/                        ← RÉFÉRENCE API
│   ├── API_REFERENCE.md           ← Référence complète
│   ├── API_VERSIONING.md          ← Versioning
│   ├── API_MIGRATION_V1.md        ← Migration
│   ├── FRONTEND_API_GUIDE.md      ← Guide Frontend
│   └── SPACES_API_GUIDE.md        ← API Spaces
│
├── 🔐 auth/                       ← AUTHENTIFICATION
│   ├── AUTH_QUICKSTART.md         ← Démarrage rapide
│   ├── AUTH_TESTING_GUIDE.md      ← Tests
│   ├── MULTI_TENANT.md            ← Multi-tenant
│   ├── FRONTEND_GUIDE.md          ← Intégration Frontend
│   └── API_REFERENCE.md           ← Endpoints Auth
│
├── 🎫 weezevent/                  ← INTÉGRATION WEEZEVENT
│   ├── WEEZEVENT_INDEX.md         ← Index
│   ├── WEEZEVENT_ARCHITECTURE.md  ← Architecture
│   ├── WEEZEVENT_INTEGRATION.md   ← Intégration
│   ├── WEEZEVENT_SYNC_USER_GUIDE.md ← Synchronisation
│   ├── WEEZEVENT_WEBHOOK_*.md     ← Webhooks
│   ├── WEEZEVENT_ANALYTICS*.md    ← Analytics
│   └── ...                        ← Autres guides
│
├── 🧪 testing/                    ← TESTS
│   └── SPACES_TESTING_GUIDE.md    ← Tests Spaces
│
└── 📊 reports/                    ← RAPPORTS
    └── ...                        ← Rapports de tests
```

---

## 🚀 Démarrage Rapide

### Installation (5 min)
```bash
# 1. Cloner le projet
git clone <repo-url> && cd api-datafriday

# 2. Copier l'environnement
cp .env.example envFiles/.env.development

# 3. Démarrer
make dev-up

# 4. Vérifier
curl http://localhost:3000/api/v1/health
```

### Commandes Essentielles
```bash
make dev-up          # Démarrer en dev
make dev-logs        # Voir les logs
make dev-studio      # Prisma Studio (DB)
make dev-down        # Arrêter
make test            # Lancer les tests
make organize-docs   # Organiser la doc
```

---

## 🏗️ Architecture HEOS

> **HEOS** = Hybrid Event-driven Orchestrated System

### Principe
```
Client → NestJS (Orchestrateur) → Dispatch intelligent
                │
                ├─→ Simple        → Prisma direct (< 50ms)
                ├─→ Cache         → Redis (< 10ms)
                ├─→ Analytics     → Materialized Views (< 50ms)
                ├─→ Calculs       → Edge Functions (< 500ms)
                └─→ Jobs longs    → BullMQ (async)
```

### Documents Clés
| Document | Description |
|----------|-------------|
| [HEOS_ARCHITECTURE_GUIDE.md](architecture/HEOS_ARCHITECTURE_GUIDE.md) | Guide complet HEOS |
| [HYBRID_ARCHITECTURE.md](architecture/HYBRID_ARCHITECTURE.md) | NestJS + Supabase Edge |
| [PERFORMANCE_BENCHMARKS.md](architecture/PERFORMANCE_BENCHMARKS.md) | Benchmarks détaillés |
| [COST_OPTIMIZATION.md](architecture/COST_OPTIMIZATION.md) | Réduire les coûts |
| [VPS_VS_CLOUD_COMPARISON.md](architecture/VPS_VS_CLOUD_COMPARISON.md) | Choix infrastructure |

---

## 💰 Coûts Estimés

| Configuration | Coût/mois | Performance |
|---------------|-----------|-------------|
| **Starter** (Cloud) | $10-25 | ⭐⭐⭐ |
| **Growth** (Hybride VPS) | $40-50 | ⭐⭐⭐⭐⭐ |
| **Scale** (Multi-VPS) | $100-200 | ⭐⭐⭐⭐⭐ |

---

## 📊 Stack Technique

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

## 🔗 Liens Rapides

### Par Rôle

| Rôle | Documents |
|------|-----------|
| **Nouveau dev** | [SETUP](getting-started/SETUP.md) → [DEVELOPMENT](getting-started/DEVELOPMENT.md) |
| **Frontend** | [FRONTEND_API_GUIDE](api/FRONTEND_API_GUIDE.md) → [AUTH](auth/FRONTEND_GUIDE.md) |
| **DevOps** | [ENVIRONMENTS](getting-started/ENVIRONMENTS.md) → [VPS_VS_CLOUD](architecture/VPS_VS_CLOUD_COMPARISON.md) |
| **Architecte** | [HEOS](architecture/HEOS_ARCHITECTURE_GUIDE.md) → [HYBRID](architecture/HYBRID_ARCHITECTURE.md) |

### Par Fonctionnalité

| Fonctionnalité | Document |
|----------------|----------|
| Authentification | [auth/AUTH_QUICKSTART.md](auth/AUTH_QUICKSTART.md) |
| Weezevent Sync | [weezevent/WEEZEVENT_SYNC_USER_GUIDE.md](weezevent/WEEZEVENT_SYNC_USER_GUIDE.md) |
| Analytics | [weezevent/WEEZEVENT_ANALYTICS_GUIDE.md](weezevent/WEEZEVENT_ANALYTICS_GUIDE.md) |
| API Spaces | [api/SPACES_API_GUIDE.md](api/SPACES_API_GUIDE.md) |

---

## 📝 Contribution

1. Suivre la structure existante
2. Placer les fichiers dans le bon dossier
3. Mettre à jour cet INDEX si nécessaire
4. Utiliser `make organize-docs` pour réorganiser

---

*Documentation DataFriday API v2.0 - Architecture HEOS*
