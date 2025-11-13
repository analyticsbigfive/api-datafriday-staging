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

## Modèles de Données (27)

### Multi-Tenant (1)
- **Tenant** - Organisation

### Espaces (6)
- Space, Config
- Floor, FloorElement
- Forecourt, ForecourtElement

### Menu (10)
- MenuItem, MenuComponent
- MenuItemComponent, MenuItemIngredient, MenuItemPackaging
- ComponentIngredient, ComponentComponent
- Station, MenuAssignment, CsvMapping

### Prix & Inventaire (4)
- Supplier, MarketPrice
- Ingredient, Packaging

### Users & Access (3)
- User, UserPinnedSpace, UserSpaceAccess

### Enums (16)
TenantPlan, TenantStatus, UserRole, StorageType, Diet, ElementType, EntranceType, GoodType, MenuItemCategory, IngredientCategory, ShopType, AccessType, HospitalityType, etc.

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

### Middleware Prisma (À implémenter)

```typescript
// Auto-scoping par tenantId
prisma.$use(async (params, next) => {
  const tenantId = getCurrentTenantId(); // Depuis JWT
  
  if (SCOPED_MODELS.includes(params.model)) {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = {
        ...params.args.where,
        tenantId: tenantId,
      };
    }
  }
  
  return next(params);
});
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

### Authentification (À implémenter)

```typescript
// JWT avec tenantId
{
  userId: "...",
  tenantId: "...",
  role: "ADMIN"
}

// Guard NestJS
@UseGuards(JwtAuthGuard, TenantGuard)
@Get('spaces')
async getSpaces(@CurrentUser() user: User) {
  return this.spacesService.findAll(user.tenantId);
}
```

---

## Points Clés

### ✅ Forces
- Architecture SaaS multi-tenant complète
- 3 environnements isolés (Dev/Staging/Prod)
- 100% Docker (pas d'install locale)
- Supabase (backups, scaling, monitoring)
- Type-safety complète (Prisma + TypeScript)

### ⚠️ À implémenter
- Modules métier (Spaces, Menu, Suppliers, etc.)
- Authentification JWT + Tenant detection
- Guards & Middlewares pour auto-scoping
- Upload images (Supabase Storage)
- Tests E2E
- Documentation API (Swagger)
- Monitoring & Logs

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
    └── ENVIRONMENTS.md         # Guide 3 envs
```

---

**Architecture solide et prête pour le développement !** 🚀
