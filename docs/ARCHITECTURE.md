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
# 🏗️ Architecture Roadmap - DataFriday SaaS

**Stack:** NestJS + Fastify + Prisma + Supabase  
**Architecture:** Feature-First + Clean Code + DDD  
**Type:** Multi-Tenant SaaS (High Data Volume)

---

## 📊 État Actuel

✅ **Infrastructure**
- Database: 24 tables, 94 RLS policies
- Multi-tenant: Isolation complète via RLS
- Docker: Dev/Staging/Prod ready
- Migrations: Prisma automatiques

❌ **À Construire**
- Architecture applicative
- Features métier
- API endpoints
- Authentification/Authorization
- Validation & Transformation
- Caching & Performance
- Monitoring & Logging

---

## 🎯 Architecture Proposée

### 📁 Structure Feature-First

```
src/
├── main.ts
├── app.module.ts
│
├── core/                          # Infrastructure globale
│   ├── database/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── tenant.interceptor.ts   # Injection automatique tenantId
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── guards/
│   │   │   ├── jwt.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── current-tenant.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   ├── exceptions/
│   │   ├── all-exceptions.filter.ts
│   │   └── domain.exception.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   ├── transform.interceptor.ts
│   │   └── timeout.interceptor.ts
│   └── pipes/
│       └── validation.pipe.ts
│
├── shared/                        # Utilitaires partagés
│   ├── dto/
│   │   ├── pagination.dto.ts
│   │   └── base-response.dto.ts
│   ├── interfaces/
│   │   ├── paginated.interface.ts
│   │   └── tenant-aware.interface.ts
│   ├── decorators/
│   │   └── api-paginated-response.decorator.ts
│   └── utils/
│       ├── slug.util.ts
│       └── date.util.ts
│
├── features/                      # FEATURE-FIRST
│   │
│   ├── tenants/                   # Feature: Gestion Tenants
│   │   ├── tenants.module.ts
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   │   ├── create-tenant.command.ts
│   │   │   │   └── update-tenant.command.ts
│   │   │   ├── queries/
│   │   │   │   ├── get-tenant.query.ts
│   │   │   │   └── list-tenants.query.ts
│   │   │   └── handlers/
│   │   │       ├── create-tenant.handler.ts
│   │   │       └── get-tenant.handler.ts
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   └── tenant.entity.ts
│   │   │   ├── repositories/
│   │   │   │   └── tenant.repository.interface.ts
│   │   │   └── value-objects/
│   │   │       └── tenant-plan.vo.ts
│   │   ├── infrastructure/
│   │   │   └── repositories/
│   │   │       └── prisma-tenant.repository.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       │   └── tenants.controller.ts
│   │       └── dto/
│   │           ├── create-tenant.dto.ts
│   │           ├── update-tenant.dto.ts
│   │           └── tenant.response.dto.ts
│   │
│   ├── users/                     # Feature: Gestion Users
│   │   ├── users.module.ts
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── spaces/                    # Feature: Gestion Spaces (Venues)
│   │   ├── spaces.module.ts
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── configs/                   # Feature: Config (Floors, Forecourt)
│   │   ├── configs.module.ts
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── menu-items/                # Feature: Menu Items
│   │   ├── menu-items.module.ts
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   │   ├── create-menu-item.command.ts
│   │   │   │   ├── update-menu-item.command.ts
│   │   │   │   └── bulk-import-menu-items.command.ts
│   │   │   └── queries/
│   │   │       ├── get-menu-item.query.ts
│   │   │       ├── list-menu-items.query.ts
│   │   │       └── calculate-cost.query.ts
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── ingredients/               # Feature: Ingredients
│   │   ├── ingredients.module.ts
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── suppliers/                 # Feature: Suppliers
│   │   ├── suppliers.module.ts
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── market-prices/             # Feature: Market Prices
│   │   ├── market-prices.module.ts
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   │   └── sync-prices.command.ts
│   │   │   └── queries/
│   │   │       └── get-price-history.query.ts
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── stations/                  # Feature: Stations & Menu Assignment
│   │   ├── stations.module.ts
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   │   └── assign-menu.command.ts
│   │   │   └── queries/
│   │   │       └── get-station-menu.query.ts
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   └── csv-import/                # Feature: CSV Import (Market Prices)
│       ├── csv-import.module.ts
│       ├── application/
│       │   ├── commands/
│       │   │   └── import-csv.command.ts
│       │   └── services/
│       │       ├── csv-parser.service.ts
│       │       └── csv-mapper.service.ts
│       ├── domain/
│       ├── infrastructure/
│       └── presentation/
│
└── config/                        # Configuration
    ├── database.config.ts
    ├── jwt.config.ts
    └── app.config.ts
```

---

## 🚀 Roadmap d'Implémentation

### **Phase 1: Core Infrastructure** (Semaine 1-2)

#### ✅ Étape 1.1: Database & Tenant Context
```bash
# Objectif: Injection automatique du tenantId dans toutes les requêtes
```

**Fichiers à créer:**
- `src/core/database/prisma.module.ts` - Module Prisma global
- `src/core/database/prisma.service.ts` - Service avec middleware RLS
- `src/core/database/tenant.interceptor.ts` - Intercepteur tenant context
- `src/core/database/interfaces/tenant-aware.interface.ts`

**Fonctionnalités:**
- ✅ Connexion Prisma avec pooling
- ✅ Middleware Prisma pour logger les requêtes
- ✅ Extension Prisma pour auto-injection `tenantId`
- ✅ Gestion des transactions

#### ✅ Étape 1.2: Authentication & Authorization
```bash
# Objectif: JWT + Guards + Decorators
```

**Fichiers à créer:**
- `src/core/auth/auth.module.ts`
- `src/core/auth/guards/jwt.guard.ts` - Validation JWT
- `src/core/auth/guards/roles.guard.ts` - RBAC (ADMIN/MANAGER/STAFF)
- `src/core/auth/decorators/current-user.decorator.ts`
- `src/core/auth/decorators/current-tenant.decorator.ts`
- `src/core/auth/decorators/roles.decorator.ts`
- `src/core/auth/strategies/jwt.strategy.ts` - Validation Supabase JWT

**Dépendances à ajouter:**
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/passport-jwt
```

#### ✅ Étape 1.3: Global Exception Handling
```bash
# Objectif: Standardiser les erreurs API
```

**Fichiers à créer:**
- `src/core/exceptions/all-exceptions.filter.ts`
- `src/core/exceptions/domain.exception.ts`
- `src/core/exceptions/tenant-not-found.exception.ts`

**Format de réponse:**
```typescript
{
  statusCode: 400,
  message: "Validation failed",
  errors: [...],
  timestamp: "2024-11-14T...",
  path: "/api/v1/menu-items"
}
```

#### ✅ Étape 1.4: Validation & Transformation
```bash
# Objectif: Valider + Transformer les requêtes/réponses
```

**Fichiers à créer:**
- `src/core/pipes/validation.pipe.ts` - class-validator
- `src/core/interceptors/transform.interceptor.ts` - Transformation réponse
- `src/shared/dto/pagination.dto.ts`
- `src/shared/dto/base-response.dto.ts`

**Dépendances:**
```bash
npm install class-validator class-transformer
```

---

### **Phase 2: Features Critiques** (Semaine 3-4)

#### ✅ Étape 2.1: Feature TENANTS
```bash
# Objectif: CRUD Tenants + Onboarding
```

**Endpoints:**
```
POST   /api/v1/tenants          # Créer tenant
GET    /api/v1/tenants/:id      # Détails tenant
PATCH  /api/v1/tenants/:id      # Mettre à jour
DELETE /api/v1/tenants/:id      # Supprimer (soft delete)
GET    /api/v1/tenants/:id/stats # Statistiques usage
```

**Business Logic:**
- Génération automatique `slug` depuis `name`
- Validation unicité `slug` et `domain`
- Plan par défaut: FREE
- Création d'un user ADMIN lors de l'onboarding

#### ✅ Étape 2.2: Feature USERS
```bash
# Objectif: Gestion users + Roles + Permissions
```

**Endpoints:**
```
POST   /api/v1/users            # Inviter user
GET    /api/v1/users            # Liste users (tenant)
GET    /api/v1/users/:id        # Détails user
PATCH  /api/v1/users/:id        # Mettre à jour
DELETE /api/v1/users/:id        # Retirer user
POST   /api/v1/users/:id/spaces # Donner accès à space
```

**Business Logic:**
- Email unique par tenant
- Vérification role (ADMIN/MANAGER/STAFF/VIEWER)
- Gestion UserSpaceAccess
- Gestion UserPinnedSpace

#### ✅ Étape 2.3: Feature SPACES
```bash
# Objectif: Gestion venues (espaces)
```

**Endpoints:**
```
POST   /api/v1/spaces           # Créer space
GET    /api/v1/spaces           # Liste spaces (tenant)
GET    /api/v1/spaces/:id       # Détails space
PATCH  /api/v1/spaces/:id       # Mettre à jour
DELETE /api/v1/spaces/:id       # Supprimer
POST   /api/v1/spaces/:id/pin   # Épingler space
DELETE /api/v1/spaces/:id/pin   # Désépingler
```

---

### **Phase 3: Features Métier** (Semaine 5-8)

#### ✅ Étape 3.1: Feature MENU-ITEMS
```bash
# Objectif: Gestion catalogue menu + Calcul coûts
```

**Endpoints:**
```
POST   /api/v1/menu-items                    # Créer item
GET    /api/v1/menu-items                    # Liste (pagination, filtres)
GET    /api/v1/menu-items/:id                # Détails + breakdown coût
PATCH  /api/v1/menu-items/:id                # Mettre à jour
DELETE /api/v1/menu-items/:id                # Supprimer
POST   /api/v1/menu-items/bulk-import        # Import CSV/JSON
GET    /api/v1/menu-items/:id/cost-analysis  # Analyse rentabilité
```

**Business Logic:**
- Calcul automatique `totalCost` depuis ingredients + components
- Calcul `margin` = ((basePrice - totalCost) / basePrice) * 100
- Validation `diet`, `allergens`
- Support `componentsData` JSON pour compatibilité Figma

#### ✅ Étape 3.2: Feature INGREDIENTS
```bash
# Objectif: Gestion ingrédients + Prix
```

**Endpoints:**
```
POST   /api/v1/ingredients                   # Créer ingrédient
GET    /api/v1/ingredients                   # Liste (filtres: category, active)
GET    /api/v1/ingredients/:id               # Détails
PATCH  /api/v1/ingredients/:id               # Mettre à jour
DELETE /api/v1/ingredients/:id               # Désactiver
GET    /api/v1/ingredients/:id/price-history # Historique prix
```

#### ✅ Étape 3.3: Feature SUPPLIERS
```bash
# Objectif: Gestion fournisseurs
```

**Endpoints:**
```
POST   /api/v1/suppliers        # Créer fournisseur
GET    /api/v1/suppliers        # Liste fournisseurs
GET    /api/v1/suppliers/:id    # Détails + market prices
PATCH  /api/v1/suppliers/:id    # Mettre à jour
DELETE /api/v1/suppliers/:id    # Supprimer
```

**Business Logic:**
- Gestion `sites[]` (array de spaceIds)
- Validation email, tel

#### ✅ Étape 3.4: Feature MARKET-PRICES
```bash
# Objectif: Gestion prix marché + Sync
```

**Endpoints:**
```
POST   /api/v1/market-prices           # Créer prix
GET    /api/v1/market-prices           # Liste
GET    /api/v1/market-prices/:id       # Détails
PATCH  /api/v1/market-prices/:id       # Mettre à jour
POST   /api/v1/market-prices/sync      # Sync depuis CSV
```

#### ✅ Étape 3.5: Feature CONFIGS (Floors + Forecourt)
```bash
# Objectif: Gestion configuration espaces
```

**Endpoints:**
```
POST   /api/v1/spaces/:spaceId/configs         # Créer config
GET    /api/v1/spaces/:spaceId/configs         # Liste configs
GET    /api/v1/configs/:id                     # Détails complet
PATCH  /api/v1/configs/:id                     # Mettre à jour
POST   /api/v1/configs/:id/floors              # Ajouter floor
POST   /api/v1/configs/:id/forecourt           # Ajouter forecourt
```

**Business Logic:**
- Validation structure JSON `data.floors[]`, `data.forecourt`
- Support FloorElement, ForecourtElement
- Calcul automatique capacity

#### ✅ Étape 3.6: Feature STATIONS
```bash
# Objectif: Attribution menus aux stations
```

**Endpoints:**
```
POST   /api/v1/stations                     # Créer station
GET    /api/v1/configs/:id/stations         # Liste stations
POST   /api/v1/stations/:id/menu            # Assigner menu item
DELETE /api/v1/stations/:id/menu/:itemId   # Retirer menu item
GET    /api/v1/stations/:id/menu            # Menu complet station
```

---

### **Phase 4: Performance & Scalabilité** (Semaine 9-10)

#### ✅ Étape 4.1: Caching Strategy
```bash
# Objectif: Redis pour hot data
```

**Dépendances:**
```bash
npm install @nestjs/cache-manager cache-manager
npm install cache-manager-redis-store
```

**Stratégie:**
- **Cache:** Menu items (TTL: 1h)
- **Cache:** Market prices (TTL: 30min)
- **Cache:** Configs (TTL: 2h)
- **Invalidation:** Sur UPDATE/DELETE

#### ✅ Étape 4.2: Rate Limiting
```bash
# Objectif: Protéger API des abus
```

**Dépendances:**
```bash
npm install @nestjs/throttler
```

**Limites:**
- FREE plan: 100 req/min
- PROFESSIONAL: 500 req/min
- ENTERPRISE: 2000 req/min

#### ✅ Étape 4.3: Bulk Operations
```bash
# Objectif: Import/Export massif
```

**Endpoints:**
```
POST   /api/v1/bulk/menu-items/import   # Import JSON/CSV
POST   /api/v1/bulk/ingredients/import
GET    /api/v1/bulk/menu-items/export   # Export CSV
```

**Features:**
- Queue system (Bull)
- Progress tracking
- Validation par batch
- Rollback si erreur

---

### **Phase 5: Monitoring & Observability** (Semaine 11)

#### ✅ Étape 5.1: Logging
```bash
# Objectif: Logs structurés
```

**Dépendances:**
```bash
npm install winston nest-winston
```

**Format:**
```json
{
  "timestamp": "2024-11-14T...",
  "level": "info",
  "tenantId": "tenant-123",
  "userId": "user-456",
  "method": "POST",
  "url": "/api/v1/menu-items",
  "duration": 45,
  "statusCode": 201
}
```

#### ✅ Étape 5.2: Health Checks
```bash
# Objectif: Monitoring uptime
```

**Endpoints:**
```
GET /health           # Liveness
GET /health/ready     # Readiness (DB, Redis)
GET /metrics          # Prometheus metrics
```

---

## 📦 Packages à Installer

### Core
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install class-validator class-transformer
npm install @nestjs/throttler
npm install @nestjs/cache-manager cache-manager
```

### Performance
```bash
npm install @nestjs/bull bull
npm install ioredis cache-manager-redis-store
```

### Observability
```bash
npm install winston nest-winston
npm install @nestjs/terminus
npm install prom-client
```

### Utils
```bash
npm install csv-parser fast-csv
npm install dayjs
npm install slugify
```

---

## 🎯 Priorisation des Features

### 🔥 **P0 - Critique** (Semaine 1-4)
1. Database + Tenant Context
2. Auth + Guards
3. Tenants CRUD
4. Users CRUD
5. Spaces CRUD

### ⚡ **P1 - Important** (Semaine 5-8)
6. Menu Items + Coût
7. Ingredients
8. Suppliers
9. Market Prices
10. Configs (Floors/Forecourt)
11. Stations + Menu Assignment

### 💡 **P2 - Nice to Have** (Semaine 9+)
12. Caching
13. Rate Limiting
14. Bulk Import/Export
15. Monitoring
16. Analytics

---

## 🧪 Tests Strategy

### Unit Tests
```typescript
// Pour chaque Handler
describe('CreateMenuItemHandler', () => {
  it('should create menu item with calculated cost', async () => {
    // Given
    const command = new CreateMenuItemCommand(...)
    
    // When
    const result = await handler.execute(command)
    
    // Then
    expect(result.totalCost).toBe(expectedCost)
  })
})
```

### Integration Tests
```typescript
// Pour chaque endpoint
describe('POST /menu-items', () => {
  it('should require authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/menu-items')
      .expect(401)
  })
})
```

### E2E Tests
```typescript
// Scénarios complets
describe('Menu Item Workflow', () => {
  it('should create, update, and delete menu item', async () => {
    // Create → Update → Delete
  })
})
```

---

## 📊 Métrique de Succès

### Performance
- ✅ Temps de réponse p95 < 200ms
- ✅ Throughput > 1000 req/s
- ✅ 99.9% uptime

### Code Quality
- ✅ Coverage > 80%
- ✅ 0 erreurs ESLint
- ✅ TypeScript strict mode

### DevOps
- ✅ CI/CD automatisé
- ✅ Déploiement sans downtime
- ✅ Rollback < 2 min

---

## 🚀 Commencer Maintenant

**Prochaine étape immédiate:**

```bash
# 1. Créer la structure core
mkdir -p src/core/{database,auth,exceptions,interceptors,pipes}
mkdir -p src/shared/{dto,interfaces,decorators,utils}
mkdir -p src/config

# 2. Installer les dépendances P0
npm install @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer

# 3. Créer le premier module: Database
```

**Je peux commencer à implémenter ?** 🚀
