# API DataFriday

**SaaS Multi-Tenant** - API NestJS + Fastify + Prisma + PostgreSQL - **100% Docker**

## Prérequis

- Docker >= 24.x
- Docker Compose >= 2.x

**Pas besoin de Node.js, npm, ou PostgreSQL sur votre machine.**

> **Multi-Tenant**: Chaque organisation (tenant) a ses données isolées. Voir [MULTI_TENANT.md](./MULTI_TENANT.md)

---

## 🚀 Démarrage

```bash
make quickstart
```

L'API sera sur: **http://localhost:3000/api/v1**

---

## Commandes principales

| Commande | Description |
|----------|-------------|
| `make quickstart` | Setup complet + démarrage |
| `make up` | Démarrer les conteneurs |
| `make dev` | Mode développement (hot-reload) |
| `make down` | Arrêter tout |
| `make logs-api` | Voir les logs |
| `make shell-api` | Shell dans le conteneur |
| `make prisma-studio` | Interface DB graphique |
| `make clean` | Tout nettoyer |
| `make help` | Toutes les commandes |

---

## Endpoints

- **Health check:** http://localhost:3000/api/v1/health
- **Prisma Studio:** http://localhost:5555 (via `make prisma-studio`)

---

## Modèles de données (Prisma)

27 modèles + Multi-Tenant:
- **Multi-Tenant:** **Tenant** (organisations) avec plans FREE/STARTER/PRO/ENTERPRISE
- **Espaces:** Space, Config, Floor, FloorElement, Forecourt, ForecourtElement
- **Menu:** MenuItem, MenuComponent, Station, MenuAssignment  
- **Prix:** Supplier, MarketPrice, Ingredient, Packaging
- **Users:** User, UserPinnedSpace, UserSpaceAccess
- +10 tables de jonction

**Architecture SaaS:** Toutes les données sont scopées par `tenantId` pour isolation complète.

Voir `prisma/schema.prisma` et [MULTI_TENANT.md](./MULTI_TENANT.md)

---

## Configuration

Fichier `.env` (auto-généré):

```bash
API_PORT=3000
POSTGRES_USER=datafriday
POSTGRES_PASSWORD=datafriday_password
POSTGRES_DB=datafriday
DATABASE_URL="postgresql://datafriday:datafriday_password@postgres:5432/datafriday?schema=public"
```

---

## Workflow Docker

### Développement avec hot-reload:
```bash
make dev           # Démarrer en mode dev
make logs-api      # Suivre les logs
# Les changements de code sont automatiquement rechargés
```

### Migrations Prisma:
```bash
make prisma-migrate     # Créer une nouvelle migration
make prisma-seed        # Peupler la DB avec données test
```

### Accéder au conteneur:
```bash
make shell-api     # Shell dans le conteneur API
make shell-db      # psql dans PostgreSQL
```

### Nettoyage:
```bash
make down          # Arrêter
make clean         # Arrêter + supprimer volumes
make rebuild       # Reconstruire complètement
```

---

## Troubleshooting

**Port déjà utilisé:**
```bash
# Changer API_PORT dans .env
API_PORT=3001
make restart
```

**Erreur Prisma:**
```bash
make prisma-generate
make prisma-migrate
```

**Conteneurs ne démarrent pas:**
```bash
make rebuild
```

**Reset complet:**
```bash
make clean
make quickstart
```

---

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  Fastify    │
│   NestJS    │
├─────────────┤
│   Prisma    │
└──────┬──────┘
       │
┌──────▼──────┐
│  PostgreSQL │
└─────────────┘
```

Tout tourne dans Docker. Aucune installation locale nécessaire.
