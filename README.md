# API DataFriday

**SaaS Multi-Tenant** - API NestJS + Fastify + Prisma + PostgreSQL - **100% Docker**

---

## 🚀 Nouveau sur le Projet ?

👉 **[START_HERE.md](./START_HERE.md)** ← Guide de démarrage rapide (5 min)

---

## 📌 Status Actuel

✅ **Fonctionnel :**
- NestJS + Fastify + Prisma + Supabase PostgreSQL
- Docker 100% (dev/staging/prod)
- 15 tables avec RLS (Row-Level Security)
- Migrations Prisma + Supabase organisées
- 3 environnements (dev/staging/prod)

📚 **Documentation :**
- **Workflow Migrations :** [`WORKFLOW.md`](./WORKFLOW.md) ⭐
- [`CURRENT_STATUS.md`](./CURRENT_STATUS.md)

---

## ⚡ Quick Start

```bash
# 1. Config (éditer envFiles/.env.development)
# 2. Démarrer
make quickstart
```

---

## 🗄️ Migrations (2 Étapes)

### 1️⃣ Modifier `schema.prisma`

```prisma
model User {
  avatar String?  // ← Ajouter champ
}
```

### 2️⃣ Migrer

```bash
make dev-migrate
# Nom: add_user_avatar
# ✅ Prisma génère et applique automatiquement !
```

---

## ⚡ Quick Start (suite)

```bash
# 3. Appliquer RLS
make supabase-migrate-all

# 4. Vérifier
make supabase-check-rls

# ✅ API prête sur http://localhost:3000/api/v1
```

---

## Prérequis

- Docker >= 24.x
- Docker Compose >= 2.x

**Pas besoin de Node.js, npm, ou PostgreSQL sur votre machine.**

> **Multi-Tenant SaaS**: 3 environnements (Dev/Staging/Prod) avec Supabase  
> **Documentation:** Voir [docs/](./docs/)

---

## 🚀 Démarrage

### 3 Environnements Supabase disponibles

**Pas de PostgreSQL local** - Utilisez vos projets Supabase:

```bash
# DEVELOPMENT
make dev-up

# STAGING  
make staging-up

# PRODUCTION
make prod-up
```

**Configuration requise:** Voir [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md)

L'API sera sur: **http://localhost:3000/api/v1**

---

## Commandes par environnement

### Development
| Commande | Description |
|----------|-------------|
| `make dev-up` | Démarrer DEV |
| `make dev-down` | Arrêter DEV |
| `make dev-migrate` | Migrations DEV |
| `make dev-seed` | Seed DEV |
| `make dev-studio` | Prisma Studio |
| `make dev-logs` | Logs DEV |

### Staging
| Commande | Description |
|----------|-------------|
| `make staging-up` | Démarrer STAGING |
| `make staging-down` | Arrêter STAGING |
| `make staging-migrate` | Migrations STAGING |
| `make staging-logs` | Logs STAGING |

### Production
| Commande | Description |
|----------|-------------|
| `make prod-up` | Démarrer PROD |
| `make prod-down` | Arrêter PROD |
| `make prod-migrate` | Migrations PROD |
| `make prod-logs` | Logs PROD |

**Toutes les commandes:** `make help`

---

## Accès

- **API:** http://localhost:3000/api/v1
- **Health check:** http://localhost:3000/api/v1/health
- **Prisma Studio:** http://localhost:5555 (via `make prisma-studio`)

---

## Documentation

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Architecture multi-tenant & Stack technique
- **[docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md)** - Guide des 3 environnements Supabase
- **[prisma/schema.prisma](./prisma/schema.prisma)** - 27 modèles de données

**27 modèles:** Tenant, Space, Config, Floor, Supplier, MenuItem, MenuComponent, User, etc.

---

## Configuration

3 fichiers `.env` à remplir avec vos credentials Supabase:

- `.env.development` - Projet Supabase DEV
- `.env.staging` - Projet Supabase STAGING
- `.env.production` - Projet Supabase PROD

**Voir:** [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md) pour le setup complet

---

## Commandes utiles

```bash
# Migrations
make dev-migrate        # Créer/appliquer migration (dev)
make staging-migrate    # Appliquer migrations (staging)
make prod-migrate       # Appliquer migrations (prod)

# Seed
make dev-seed          # Peupler avec données test

# Prisma Studio (interface DB)
make dev-studio        # → http://localhost:5555

# Shell dans conteneur
make shell-api

# Nettoyage
make dev-down          # Arrêter
make rebuild           # Reconstruire
```

**Toutes les commandes:** `make help`

---

## Support

**Erreurs communes:**
- Port 3000 occupé → Modifier `API_PORT` dans `.env`
- Erreur Prisma → `make dev-migrate`
- Rebuild complet → `make rebuild`

**Documentation complète:** Voir [docs/](./docs/)
