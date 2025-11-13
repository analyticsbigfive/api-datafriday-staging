# 🗄️ Workflow Migrations

## Ultra-Simple : 2 Étapes

### 1. Modifier `schema.prisma`

```prisma
model User {
  avatar String?  // ← nouveau champ
}
```

### 2. Migrer (AUTO)

```bash
make dev-migrate
```

```
Nom: add_user_avatar
```

**Prisma génère le SQL automatiquement et l'applique !** 🎉

### 3. ✅ Fait !

---

## Exemples SQL Courants

**Ajouter colonne:**
```sql
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
```

**Supprimer colonne:**
```sql
ALTER TABLE "User" DROP COLUMN "phone";
```

**Modifier type:**
```sql
ALTER TABLE "Product" ALTER COLUMN "price" TYPE DECIMAL(10,2);
```

**Ajouter NOT NULL:**
```sql
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
```

---

## Commandes

- `make dev-migrate` → Créer + appliquer migration
- `make supabase-check-rls` → Vérifier RLS
- `make dev-logs` → Voir logs
