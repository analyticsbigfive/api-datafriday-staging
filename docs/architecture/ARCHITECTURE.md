# 🏗️ Architecture du Projet

## Stack Technique

- **Backend:** NestJS 10 + Fastify 4
- **ORM:** Prisma 5
- **Base de données:** Supabase PostgreSQL
- **Container:** Docker + Docker Compose
- **Language:** TypeScript 5

---

## Architecture Multi-Tenant SaaS

### Concept

Chaque **organisation (tenant)** a ses données isolées via `tenantId`.

```
Tenant 1                    Tenant 2
├── Users                   ├── Users
├── Spaces                  ├── Spaces
├── Suppliers               ├── Suppliers
└── Menu Items              └── Menu Items

Isolation via tenantId
```

### Modèle Tenant

```prisma
model Tenant {
  id       String       @id @default(cuid())
  slug     String       @unique     // "acme-corp"
  name     String                   // "ACME Corporation"
  domain   String?      @unique     // "acme.datafriday.com"
  plan     TenantPlan              // FREE/STARTER/PRO/ENTERPRISE
  status   TenantStatus            // ACTIVE/TRIAL/SUSPENDED
  
  users    User[]
  spaces   Space[]
  suppliers Supplier[]
}
```

### Plans Disponibles

- **FREE** - Gratuit, fonctionnalités limitées
- **STARTER** - Petites organisations
- **PROFESSIONAL** - Moyennes organisations
- **ENTERPRISE** - Grandes organisations

### Scoping des Données

**Tous les modèles principaux ont `tenantId`:**

```prisma
model Space {
  tenantId String
  tenant   Tenant @relation(...)
  // ...
}

model User {
  email    String
  tenantId String
  @@unique([email, tenantId])  // Email unique par tenant
}

model Supplier {
  tenantId String
  tenant   Tenant @relation(...)
  // ...
}
```

**Avantages:**
- ✅ Isolation forte des données
- ✅ Même email possible sur plusieurs tenants
- ✅ Cascade delete automatique
- ✅ Index sur tenantId pour performance

---

## Sécurité Multi-Tenant

### Row Level Security (RLS)

Activer sur Supabase pour isolation renforcée:

```sql
-- Activer RLS
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;

-- Policy pour Space
CREATE POLICY "tenant_isolation" ON "Space"
  USING ("tenantId" = current_setting('app.current_tenant_id')::text);

-- Répéter pour tous les modèles scopés
```

---

## Architecture Docker

### 3 Environnements Supabase

Pas de PostgreSQL local - Tout sur Supabase:

```
Development  → docker-compose.yml
Staging      → docker-compose.staging.yml
Production   → docker-compose.production.yml

Chacun avec son propre projet Supabase
```

### Image Docker Multi-Stage

```dockerfile
Stage 1: Builder
- Node 20 Alpine
- OpenSSL pour Prisma
- npm ci + build

Stage 2: Production
- Node 20 Alpine
- OpenSSL
- Copie dist/ depuis builder
- Prisma generate
```

**Avantages:**
- Image production légère (~200MB)
- Build cache optimisé
- Sécurité renforcée

---

## Workflow de Développement

### Migrations Prisma

```bash
# 1. Développer en DEV
make dev-up
# Modifier schema.prisma
make dev-migrate  # Crée la migration

# 2. Tester en STAGING
make staging-up
make staging-migrate  # Applique la migration

# 3. Déployer en PROD
make prod-up
make prod-migrate
```

Les migrations sont **partagées** entre environnements.

---

## Points Clés

### ✅ Forces
- Architecture SaaS multi-tenant complète
- 3 environnements isolés (Dev/Staging/Prod)
- 100% Docker (pas d'install locale)
- Supabase (backups, scaling, monitoring)
- Type-safety complète (Prisma + TypeScript)

### 🔐 Sécurité
- Variables `.env` jamais commitées
- RLS sur Supabase recommandé
- Connection Pooler en production
- JWT avec tenantId
- CORS restreints en prod

---

## Structure du Projet

```
api-datafriday/
├── src/
│   ├── main.ts                 # Entry point
│   ├── app.module.ts           # Root module
│   ├── prisma/                 # Prisma global module
│   └── [modules à créer]       # Spaces, Menu, etc.
│
├── prisma/
│   ├── schema.prisma           # 27 modèles
│   ├── migrations/             # Migrations partagées
│   └── seed.ts                 # Données test
│
├── docker-compose.yml          # Dev
├── docker-compose.staging.yml  # Staging
├── docker-compose.production.yml # Prod
│
├── .env.development            # Config dev
├── .env.staging                # Config staging
├── .env.production             # Config prod
│
├── Makefile                    # 50+ commandes
└── docs/                       # Documentation
    ├── ARCHITECTURE.md         # Ce fichier
    └── getting-started/ENVIRONMENTS.md  # Guide 3 envs
```

---

## Prisma

### Transactions avec retry (PrismaService)

```typescript
await prismaService.executeTransaction(async (tx) => {
  // Transaction with automatic retry on failure
}, 3); // max 3 retries
```

### Prisma Studio (éditeur visuel)

```bash
docker-compose exec api-dev npx prisma studio
# http://localhost:5555
```

### Troubleshooting

```bash
# Schéma désynchronisé
docker-compose exec api-dev npx prisma generate

# Reset DB (DEV uniquement)
docker-compose exec api-dev npx prisma migrate reset

# Voir les migrations
ls -la prisma/migrations/
```

---

*Voir [DATABASE.md supprimé → contenu fusionné ici] · [SUPABASE.md](./SUPABASE.md) pour le workflow CLI*
# 🏗️ Architecture Roadmap - DataFriday SaaS
