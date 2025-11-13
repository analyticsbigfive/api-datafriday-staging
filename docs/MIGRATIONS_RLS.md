# 🗂️ Migrations RLS par Table

**15 fichiers de migration créés** - Un par table pour une gestion propre.

---

## 📋 Liste des Migrations

| # | Fichier | Table | Description |
|---|---------|-------|-------------|
| 1 | `20241113000001_tenant_rls.sql` | Tenant | Isolation tenant principal |
| 2 | `20241113000002_user_rls.sql` | User | Users par tenant |
| 3 | `20241113000003_space_rls.sql` | Space | Espaces par tenant |
| 4 | `20241113000004_supplier_rls.sql` | Supplier | Fournisseurs par tenant |
| 5 | `20241113000005_config_rls.sql` | Config | Config via Space |
| 6 | `20241113000006_floor_rls.sql` | Floor | Étages via Space |
| 7 | `20241113000007_point_of_sale_rls.sql` | PointOfSale | POS via Space |
| 8 | `20241113000008_product_rls.sql` | Product | Produits via Supplier |
| 9 | `20241113000009_market_price_rls.sql` | MarketPrice | Prix via Product |
| 10 | `20241113000010_ingredient_rls.sql` | Ingredient | Ingrédients via Product |
| 11 | `20241113000011_menu_rls.sql` | Menu | Menus via Space |
| 12 | `20241113000012_menu_item_rls.sql` | MenuItem | Items via Menu |
| 13 | `20241113000013_station_rls.sql` | Station | Stations via Space |
| 14 | `20241113000014_event_rls.sql` | Event | Events via Space |
| 15 | `20241113000015_stock_rls.sql` | Stock | Stocks via Product |

---

## 🚀 Application des Migrations

### Méthode 1 : Toutes en une fois (Recommandé) ⭐

```bash
make supabase-migrate-all
```

**Résultat :**
```
🔒 Application des migrations RLS (15 tables)...
  → Applying 20241113000001_tenant_rls.sql...
  → Applying 20241113000002_user_rls.sql...
  ...
  → Applying 20241113000015_stock_rls.sql...
✅ Toutes les migrations RLS appliquées
```

---

### Méthode 2 : Une par une (Manuel)

```bash
# Appliquer une migration spécifique
make supabase-run-sql
# Entrer : migrations/20241113000001_tenant_rls.sql
```

---

## ✅ Vérification

### Compter les Policies

```bash
make supabase-check-rls
```

**Résultat attendu :**
```
 policies_count 
----------------
             52
(1 row)

 tablename     | rowsecurity 
---------------+-------------
 Tenant        | t
 User          | t
 Space         | t
 ...
(15 rows)
```

### Voir les Policies par Table

```bash
make supabase-psql
```

```sql
-- Lister policies pour une table
SELECT policyname, cmd FROM pg_policies 
WHERE tablename = 'User' AND schemaname='public';

-- Résultat :
--     policyname      |  cmd   
-- --------------------+--------
--  user_select_policy | SELECT
--  user_insert_policy | INSERT
--  user_update_policy | UPDATE
--  user_delete_policy | DELETE
```

---

## 📊 Architecture d'Isolation

### Isolation Directe (tenantId)
Tables avec `tenantId` direct :
- ✅ Tenant
- ✅ User
- ✅ Space
- ✅ Supplier

### Isolation Indirecte (via Space)
Tables isolées via `Space.tenantId` :
- ✅ Config
- ✅ Floor
- ✅ PointOfSale
- ✅ Menu
- ✅ MenuItem
- ✅ Station
- ✅ Event

### Isolation Indirecte (via Supplier)
Tables isolées via `Supplier.tenantId` :
- ✅ Product
- ✅ MarketPrice
- ✅ Ingredient
- ✅ Stock

---

## 🔄 Gestion des Migrations

### Ajouter une Nouvelle Migration

```bash
# 1. Créer le fichier
cat > supabase/migrations/20241113000016_new_table_rls.sql << 'EOF'
-- Migration: Enable RLS for NewTable
ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "new_table_all_policy" 
  ON "NewTable"
  FOR ALL
  USING (
    "tenantId"::text = current_setting('request.jwt.claims', true)::json->>'org_id'
  );
EOF

# 2. Appliquer
make supabase-run-sql
# Entrer : migrations/20241113000016_new_table_rls.sql
```

---

### Rollback d'une Migration

```bash
# Se connecter à psql
make supabase-psql

# Supprimer les policies d'une table
DROP POLICY IF EXISTS "user_select_policy" ON "User";
DROP POLICY IF EXISTS "user_insert_policy" ON "User";
DROP POLICY IF EXISTS "user_update_policy" ON "User";
DROP POLICY IF EXISTS "user_delete_policy" ON "User";

# Désactiver RLS
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
```

---

## 🧪 Tests

### Test 1 : Isolation Tenant

```sql
-- Simuler un utilisateur tenant A
SET request.jwt.claims = '{"org_id": "tenant-a"}';

-- Requête
SELECT * FROM "Space";

-- Résultat : Uniquement les Spaces de tenant-a
```

### Test 2 : Impossible de Bypass

```sql
-- Tenter d'insérer avec un autre tenantId
SET request.jwt.claims = '{"org_id": "tenant-a"}';

INSERT INTO "Space" (id, name, "tenantId") 
VALUES (gen_random_uuid(), 'Hacked Space', 'tenant-b');

-- Résultat : ERROR - new row violates row-level security policy
```

---

## 📚 Ressources

- **Fichier source complet :** `supabase/rls-policies.sql`
- **Migrations individuelles :** `supabase/migrations/202411130000*.sql`
- **Documentation PostgreSQL RLS :** https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## ⚡ Quick Start

```bash
# 1. Appliquer toutes les migrations
make supabase-migrate-all

# 2. Vérifier
make supabase-check-rls

# 3. Tester dans psql
make supabase-psql
```

**15 tables sécurisées en 1 commande !** 🔒
