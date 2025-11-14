# 💾 Database Guide

## Schema

27 models defined in `prisma/schema.prisma`:
- Tenant, User, Space, Config
- Floor, FloorElement, Forecourt, ForecourtElement
- Supplier, MarketPrice, Ingredient, Packaging
- MenuComponent, ComponentIngredient, ComponentComponent
- MenuItem, MenuItemComponent, MenuItemIngredient, MenuItemPackaging
- Station, MenuAssignment
- CsvMapping, UserPinnedSpace, UserSpaceAccess

---

## Migrations Workflow

### 1. Modify schema

Edit `prisma/schema.prisma`:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  avatar    String?  // ← Add new field
  // ...
}
```

### 2. Create migration

```bash
docker-compose exec api-dev npx prisma migrate dev --name add_user_avatar
```

This will:
- Generate SQL migration file
- Apply to database
- Update Prisma Client

### 3. Apply to production

```bash
docker-compose exec api-dev npx prisma migrate deploy
```

---

## Row-Level Security (RLS)

All tables have RLS policies for multi-tenant isolation.

### Enable RLS

```sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
```

### Policy example

```sql
CREATE POLICY "tenant_isolation" ON "User"
  USING ("tenantId" = current_setting('app.current_tenant')::text);
```

---

## Prisma Client Usage

### Basic queries

```typescript
// Automatically filtered by tenant via TenantInterceptor
const users = await prisma.user.findMany({
  where: { tenantId },
});
```

### Transactions

```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data });
  await tx.space.create({ data: { userId: user.id } });
});
```

### With retry (via PrismaService)

```typescript
await prismaService.executeTransaction(async (tx) => {
  // Transaction with automatic retry on failure
}, 3); // max 3 retries
```

---

## Prisma Studio

Visual database editor:

```bash
docker-compose exec api-dev npx prisma studio
```

Open: http://localhost:5555

---

## Troubleshooting

### Schema out of sync
```bash
docker-compose exec api-dev npx prisma generate
```

### Reset database (DEV only)
```bash
docker-compose exec api-dev npx prisma migrate reset
```

### View migrations
```bash
ls -la prisma/migrations/
```
