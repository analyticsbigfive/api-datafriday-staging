# 🏢 Architecture Multi-Tenant SaaS

## Concept

L'application est un **SaaS multi-tenant** où chaque organisation (tenant) a ses propres données isolées.

## Modèle de données

### Tenant (Organisation)

```prisma
model Tenant {
  id       String       @id
  slug     String       @unique        // ex: "acme-corp"
  name     String                      // ex: "ACME Corporation"
  domain   String?      @unique        // ex: "acme.datafriday.com"
  plan     TenantPlan                  // FREE, STARTER, PRO, ENTERPRISE
  status   TenantStatus                // ACTIVE, TRIAL, SUSPENDED
  metadata Json?                       // Données custom
}
```

### Plans disponibles

- **FREE** - Gratuit, fonctionnalités limitées
- **STARTER** - Petites organisations
- **PROFESSIONAL** - Organisations moyennes
- **ENTERPRISE** - Grandes organisations, tout illimité

### Statuts

- **ACTIVE** - Tenant actif, payant
- **TRIAL** - Période d'essai
- **SUSPENDED** - Suspendu (impayé, violation)
- **CANCELLED** - Annulé

---

## Isolation des données

### Scoping par tenant

Tous les modèles principaux ont un `tenantId`:

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
}
```

### Cascade delete

Quand un tenant est supprimé, **toutes ses données sont supprimées**:

```prisma
tenant   Tenant @relation(..., onDelete: Cascade)
```

---

## Exemples d'utilisation

### Créer un nouveau tenant

```typescript
const tenant = await prisma.tenant.create({
  data: {
    slug: 'acme-corp',
    name: 'ACME Corporation',
    domain: 'acme.datafriday.com',
    plan: 'PROFESSIONAL',
    status: 'ACTIVE',
  }
});
```

### Créer un user pour un tenant

```typescript
const user = await prisma.user.create({
  data: {
    email: 'admin@acme.com',
    name: 'John Doe',
    role: 'ADMIN',
    tenantId: tenant.id,  // Scoping
  }
});
```

### Récupérer les données d'un tenant

```typescript
// Tous les spaces d'un tenant
const spaces = await prisma.space.findMany({
  where: { tenantId: tenant.id }
});

// Tous les users d'un tenant
const users = await prisma.user.findMany({
  where: { tenantId: tenant.id }
});
```

### Middleware Prisma pour auto-scoping

```typescript
// Dans PrismaService
prisma.$use(async (params, next) => {
  const tenantId = getCurrentTenantId(); // Depuis contexte/JWT

  if (params.model && ['Space', 'Supplier', 'MenuItem'].includes(params.model)) {
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

## Workflow d'authentification

### 1. Signup

```
POST /api/v1/auth/signup
{
  "email": "admin@acme.com",
  "password": "...",
  "tenantSlug": "acme-corp",  // Ou créer nouveau tenant
  "tenantName": "ACME Corp"    // Si nouveau
}
```

### 2. Login

```
POST /api/v1/auth/login
{
  "email": "admin@acme.com",
  "password": "...",
  "tenantSlug": "acme-corp"  // Important!
}
```

**Retourne JWT avec:**
```json
{
  "userId": "...",
  "tenantId": "...",
  "role": "ADMIN"
}
```

### 3. Requêtes

Toutes les requêtes incluent le `tenantId` depuis le JWT:

```typescript
@UseGuards(JwtAuthGuard)
@Get('spaces')
async getSpaces(@CurrentUser() user: User) {
  // user.tenantId est automatiquement utilisé
  return this.spacesService.findAll(user.tenantId);
}
```

---

## Stratégies de subdomain

### Option 1: Subdomain par tenant

```
acme.datafriday.com    → tenant: acme-corp
demo.datafriday.com    → tenant: demo-company
```

Middleware Express/Fastify:

```typescript
app.use((req, res, next) => {
  const subdomain = req.hostname.split('.')[0];
  const tenant = await prisma.tenant.findUnique({
    where: { domain: req.hostname }
  });
  req.tenant = tenant;
  next();
});
```

### Option 2: Path-based

```
datafriday.com/acme    → tenant: acme-corp
datafriday.com/demo    → tenant: demo-company
```

### Option 3: Header-based (API)

```
GET /api/v1/spaces
X-Tenant-Id: acme-corp
Authorization: Bearer <jwt>
```

---

## Row Level Security (RLS) avec Supabase

Si vous utilisez Supabase, activez RLS:

```sql
-- Activer RLS sur Space
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their tenant's spaces
CREATE POLICY "tenant_isolation" ON "Space"
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

---

## Données seed

Le seed crée 2 tenants de test:

```bash
make prisma-seed
```

**Tenant 1: demo-company**
- Email: `admin@demo-company.com`
- Plan: PROFESSIONAL
- 1 space, 1 supplier

**Tenant 2: test-corp**
- Email: `admin@test-corp.com`
- Plan: STARTER (TRIAL)
- 1 space

---

## Considérations

### ✅ Avantages

- **Isolation forte** - Données complètement séparées
- **Simplicité** - Pas besoin de DB par tenant
- **Performance** - Indexes sur tenantId
- **Cascade delete** - Nettoyage automatique

### ⚠️ Limitations

- **Scalabilité** - Tous les tenants sur la même DB
- **Backup** - Backup par DB, pas par tenant
- **Customisation** - Pas de schéma custom par tenant

### 🔒 Sécurité

- **Toujours filtrer par tenantId**
- **Valider le tenant dans JWT**
- **RLS au niveau DB (Supabase)**
- **Audit logs par tenant**

---

## Migrations

Créer une migration après ajout de `tenantId`:

```bash
make prisma-migrate
# Name: add_multi_tenant
```

---

## Tests

Tester l'isolation:

```typescript
describe('Tenant isolation', () => {
  it('should not allow access to other tenant data', async () => {
    const tenant1Space = await createSpace({ tenantId: tenant1.id });
    const tenant2Space = await createSpace({ tenantId: tenant2.id });

    const spaces = await spacesService.findAll(tenant1.id);
    
    expect(spaces).toContainEqual(tenant1Space);
    expect(spaces).not.toContainEqual(tenant2Space);
  });
});
```

---

## Prochaines étapes

1. Implémenter middleware tenant detection
2. Ajouter guards pour vérifier tenantId
3. Créer endpoints tenant management
4. Implémenter billing par tenant
5. Ajouter analytics par tenant
6. Configurer RLS Supabase
