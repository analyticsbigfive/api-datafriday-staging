# 🔄 Workflow Complet Prisma + Supabase

**Guide complet pour gérer les migrations, nouveaux champs, suppressions, et RLS.**

---

## 📋 Architecture des Migrations

### Séparation des Responsabilités

```
Prisma (prisma/migrations/)
├── Création de tables (CREATE TABLE)
├── Ajout de colonnes (ALTER TABLE ADD)
├── Modification de colonnes (ALTER TABLE MODIFY)
├── Suppression de colonnes (ALTER TABLE DROP)
├── Contraintes (FOREIGN KEY, UNIQUE, etc.)
└── Indices (CREATE INDEX)

Supabase (supabase/migrations/)
├── Row-Level Security (RLS)
├── Policies (SELECT, INSERT, UPDATE, DELETE)
├── Functions SQL custom
├── Triggers
└── Extensions PostgreSQL
```

**Principe : Prisma gère le schéma, Supabase gère la sécurité.**

---

## 🚀 Workflow Quotidien

### 1️⃣ Nouveau Champ (Ajout de Colonne)

**Exemple : Ajouter `avatar` à User**

```bash
# 1. Modifier schema.prisma
# prisma/schema.prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  avatar    String?  // ← NOUVEAU CHAMP
  tenantId  String
  // ...
}

# 2. Créer la migration Prisma
make prisma-migrate
# Nom : "add_user_avatar"

# 3. La migration est créée dans prisma/migrations/
# prisma/migrations/20241113XXXXXX_add_user_avatar/migration.sql
# ALTER TABLE "User" ADD COLUMN "avatar" TEXT;

# 4. Appliquer sur Supabase (via Prisma)
# La migration est déjà appliquée par Prisma

# 5. RLS policies existantes couvrent déjà le nouveau champ ✅
# Pas besoin de migration RLS supplémentaire
```

**Résultat :** Nouveau champ ajouté + RLS automatiquement appliqué.

---

### 2️⃣ Nouvelle Table

**Exemple : Ajouter table `Comment`**

```bash
# 1. Modifier schema.prisma
model Comment {
  id        String   @id @default(uuid())
  content   String
  userId    String
  tenantId  String   // ← IMPORTANT pour RLS
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id])
  
  @@index([tenantId])
}

# 2. Créer migration Prisma
make prisma-migrate
# Nom : "add_comment_table"

# 3. Créer migration RLS Supabase
cat > supabase/migrations/20241113000016_comment_rls.sql << 'EOF'
-- Migration: Enable RLS for Comment table
ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_select_policy" 
  ON "Comment"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "comment_insert_policy" 
  ON "Comment"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "comment_update_policy" 
  ON "Comment"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "comment_delete_policy" 
  ON "Comment"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
EOF

# 4. Appliquer migration RLS
make supabase-run-sql
# Entrer : migrations/20241113000016_comment_rls.sql

# 5. Vérifier
make supabase-check-rls
```

---

### 3️⃣ Suppression de Champ

**Exemple : Supprimer `phone` de User**

```bash
# 1. Modifier schema.prisma (retirer le champ)
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  # phone   String?  ← SUPPRIMÉ
  tenantId  String
  // ...
}

# 2. Créer migration Prisma
make prisma-migrate
# Nom : "remove_user_phone"

# Prisma génère :
# ALTER TABLE "User" DROP COLUMN "phone";

# 3. RLS policies continuent de fonctionner ✅
# Aucune migration RLS nécessaire
```

---

### 4️⃣ Modification de Type de Champ

**Exemple : `price` de INT à DECIMAL**

```bash
# 1. Modifier schema.prisma
model Product {
  id    String  @id @default(uuid())
  price Decimal @db.Decimal(10, 2)  // ← Changé de Int à Decimal
  // ...
}

# 2. Créer migration Prisma
make prisma-migrate
# Nom : "change_product_price_to_decimal"

# Prisma génère :
# ALTER TABLE "Product" ALTER COLUMN "price" TYPE DECIMAL(10,2);

# 3. RLS inchangé ✅
```

---

### 5️⃣ Renommer un Champ

**Exemple : `name` → `fullName`**

```bash
# 1. Modifier schema.prisma
model User {
  id       String @id
  fullName String @map("name")  // ← Mapping pour éviter migration DB
  // ...
}

# OU si vraiment besoin de renommer en DB :

# 2. Migration manuelle
cat > prisma/migrations/20241113XXXXXX_rename_user_name/migration.sql << 'EOF'
ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";
EOF

# 3. Appliquer
make prisma-migrate-deploy
```

---

## 🎯 Checklist pour Chaque Modification

### ✅ Avant de Modifier

- [ ] Backup de la DB (production) : `make supabase-db-dump`
- [ ] Tester en local d'abord (development)
- [ ] Vérifier l'impact sur les relations

### ✅ Pendant la Modification

- [ ] Modifier `schema.prisma`
- [ ] Créer migration Prisma : `make prisma-migrate`
- [ ] Si nouvelle table → créer migration RLS
- [ ] Tester en development

### ✅ Après la Modification

- [ ] Vérifier RLS : `make supabase-check-rls`
- [ ] Générer client Prisma : `make prisma-generate`
- [ ] Redémarrer API : `make dev-up`
- [ ] Tester les endpoints

---

## 📊 Commandes par Environnement

### Development

```bash
# 1. Modifier schema.prisma

# 2. Créer migration (avec prompt)
make dev-migrate
# Ou
docker-compose exec api npx prisma migrate dev --name "add_user_avatar"

# 3. Si nouvelle table → RLS
make supabase-run-sql

# 4. Vérifier
make supabase-check-rls
```

### Staging

```bash
# 1. Appliquer migrations Prisma
make staging-migrate-deploy

# 2. Appliquer migrations RLS
# (Charger env staging)
docker-compose --env-file envFiles/.env.staging exec -T supabase-cli \
  psql "$DATABASE_URL" < supabase/migrations/XXXXX.sql
```

### Production

```bash
# 1. Backup
make supabase-db-dump

# 2. Appliquer migrations Prisma
make prod-migrate-deploy

# 3. Appliquer migrations RLS (si nouvelles)
# (Charger env prod)
docker-compose --env-file envFiles/.env.production exec -T supabase-cli \
  psql "$DATABASE_URL" < supabase/migrations/XXXXX.sql

# 4. Vérifier
make supabase-check-rls
```

---

## 🔒 Template Migration RLS

### Pour Table avec `tenantId` Direct

```sql
-- Migration: Enable RLS for [TableName]
-- Description: [Description]

ALTER TABLE "[TableName]" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[table]_select_policy" 
  ON "[TableName]"
  FOR SELECT
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "[table]_insert_policy" 
  ON "[TableName]"
  FOR INSERT
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "[table]_update_policy" 
  ON "[TableName]"
  FOR UPDATE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  )
  WITH CHECK (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );

CREATE POLICY "[table]_delete_policy" 
  ON "[TableName]"
  FOR DELETE
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
```

### Pour Table Indirecte (via Relation)

```sql
-- Migration: Enable RLS for [TableName]
-- Description: Isolated via [ParentTable]

ALTER TABLE "[TableName]" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[table]_all_policy" 
  ON "[TableName]"
  FOR ALL
  USING (
    "[parentIdField]" IN (
      SELECT id FROM "[ParentTable]" 
      WHERE "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );
```

---

## 🧪 Tests Automatisés (Recommandé)

### Test RLS Après Migration

```typescript
// test/rls/new-table.e2e-spec.ts
describe('Comment RLS', () => {
  it('should isolate comments by tenant', async () => {
    const tenantA = await createTenant('tenant-a');
    const tenantB = await createTenant('tenant-b');
    
    const commentA = await createComment(tenantA, 'Comment A');
    const commentB = await createComment(tenantB, 'Comment B');
    
    // Tenant A ne voit que ses comments
    const commentsA = await getComments(tenantA);
    expect(commentsA).toHaveLength(1);
    expect(commentsA[0].id).toBe(commentA.id);
    
    // Tenant B ne voit que ses comments
    const commentsB = await getComments(tenantB);
    expect(commentsB).toHaveLength(1);
    expect(commentsB[0].id).toBe(commentB.id);
  });
});
```

---

## 📚 Best Practices

### ✅ À Faire

- ✅ **Toujours tester en dev** avant staging/prod
- ✅ **Nommer clairement** les migrations (`add_user_avatar`, pas `migration_1`)
- ✅ **Versionner** les migrations dans Git
- ✅ **Documenter** les migrations complexes
- ✅ **Créer RLS** pour chaque nouvelle table avec `tenantId`
- ✅ **Utiliser `@map`** Prisma pour éviter renames DB inutiles
- ✅ **Tester RLS** après chaque nouvelle table

### ❌ À Éviter

- ❌ **Modifier** une migration déjà appliquée en prod
- ❌ **Supprimer** des colonnes sans backup
- ❌ **Oublier** le `tenantId` sur nouvelles tables
- ❌ **Skip** les migrations (toujours séquentielles)
- ❌ **SQL manuel** en prod (toujours via migrations)

---

## 🎯 Résumé Workflow

```
1. Modifier schema.prisma
   ↓
2. make prisma-migrate (nom descriptif)
   ↓
3. Si nouvelle table → créer migration RLS
   ↓
4. make supabase-run-sql (appliquer RLS)
   ↓
5. make supabase-check-rls (vérifier)
   ↓
6. Tester en dev
   ↓
7. Commit Git
   ↓
8. Déployer staging → prod
```

---

## 📁 Structure Finale

```
projet/
├── prisma/
│   ├── schema.prisma                    # Source de vérité
│   └── migrations/
│       ├── 20241113XXXXXX_init/
│       ├── 20241113XXXXXX_add_user_avatar/
│       ├── 20241113XXXXXX_add_comment_table/
│       └── ...
│
└── supabase/
    └── migrations/
        ├── 20241113000001_tenant_rls.sql      # RLS par table
        ├── 20241113000002_user_rls.sql
        ├── ...
        └── 20241113000016_comment_rls.sql     # RLS nouvelle table
```

---

## 🆘 Troubleshooting

### Migration Prisma Échoue

```bash
# Voir l'erreur détaillée
docker-compose exec api npx prisma migrate dev --name "test"

# Reset si nécessaire (DEV ONLY!)
docker-compose exec api npx prisma migrate reset
```

### RLS Non Appliqué

```bash
# Vérifier la table
make supabase-psql

SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'YourTable';

# Appliquer manuellement si besoin
ALTER TABLE "YourTable" ENABLE ROW LEVEL SECURITY;
```

### Conflit de Migration

```bash
# Résoudre les conflits Prisma
docker-compose exec api npx prisma migrate resolve --applied "20241113XXXXXX"
```

---

**Workflow propre et facile à gérer !** 🚀
