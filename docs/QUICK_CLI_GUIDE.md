# ⚡ Guide CLI Rapide - Supabase

**Pour développeurs qui veulent aller vite sans passer par le Dashboard.**

---

## 🚀 Commandes Essentielles (psql Direct - IPv4)

Ces commandes utilisent **psql directement** avec votre `DATABASE_URL`, contournant le problème IPv6 de `supabase link`.

### 1. Appliquer les RLS Policies (1 commande !) ⭐

```bash
# Charger les variables d'environnement
export $(cat envFiles/.env.development | xargs)

# Appliquer toutes les RLS policies
make supabase-apply-rls
```

**Résultat :**
```
🔒 Application des RLS policies...
✅ RLS policies appliquées
```

**C'est tout ! Vos 50+ policies RLS sont maintenant actives.** ✅

---

### 2. Vérifier les RLS

```bash
# Vérifier combien de policies sont actives
make supabase-check-rls
```

**Résultat attendu :**
```
 policies_count 
----------------
             52

 tablename     | rowsecurity 
---------------+-------------
 Tenant        | t
 User          | t
 Space         | t
 Supplier      | t
 (15 rows)
```

---

### 3. Ouvrir psql Interactif

```bash
# Se connecter directement à Supabase via psql
make supabase-psql
```

**Une fois connecté, vous pouvez :**

```sql
-- Lister les tables
\dt

-- Compter les policies
SELECT count(*) FROM pg_policies WHERE schemaname='public';

-- Voir toutes les policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';

-- Quitter
\q
```

---

### 4. Exécuter un Fichier SQL Personnalisé

```bash
# Créer votre fichier SQL dans supabase/
# Ex: supabase/add_indexes.sql

# Exécuter
make supabase-run-sql
# Entrer : add_indexes.sql
```

---

## 📋 Workflow Complet Recommandé

### Setup Initial (Une seule fois)

```bash
# 1. Configurer envFiles/.env.development avec DATABASE_URL

# 2. Démarrer les services
make dev-up
make supabase-up

# 3. Appliquer RLS
export $(cat envFiles/.env.development | xargs)
make supabase-apply-rls

# 4. Vérifier
make supabase-check-rls
```

**Durée totale : 2 minutes** ⚡

---

### Développement Quotidien

```bash
# Démarrer API + CLI
make dev-up
make supabase-up

# Si vous modifiez le schéma Prisma
make prisma-migrate
# Nom : "add_user_avatar"

# Si vous voulez créer une migration SQL custom
# 1. Créer supabase/migrations/20241113XXXXX_custom.sql
# 2. Appliquer
export $(cat envFiles/.env.development | xargs)
make supabase-run-sql
# Entrer : migrations/20241113XXXXX_custom.sql
```

---

## 🎯 Commandes Disponibles

| Commande | Description |
|----------|-------------|
| `make supabase-apply-rls` | Applique RLS policies (IPv4 direct) ⭐ |
| `make supabase-check-rls` | Vérifie les policies actives |
| `make supabase-psql` | Ouvre psql interactif |
| `make supabase-run-sql` | Exécute un fichier SQL custom |
| `make supabase-up` | Démarre conteneur CLI |
| `make supabase-shell` | Shell bash dans conteneur |

---

## 💡 Pourquoi Ces Commandes Sont Meilleures

### Avant (avec supabase link)

```bash
make supabase-link
# ❌ Erreur IPv6: network unreachable
# ❌ Besoin d'access token
# ❌ 3-4 étapes complexes
```

### Après (avec psql direct)

```bash
export $(cat envFiles/.env.development | xargs)
make supabase-apply-rls
# ✅ Marche directement
# ✅ Utilise DATABASE_URL (IPv4)
# ✅ 1 seule commande
```

---

## ⚙️ Configuration Requise

### Variables dans `envFiles/.env.development`

```bash
# DATABASE_URL (OBLIGATOIRE)
DATABASE_URL=postgresql://postgres.alsgdtewqeldrrquypdy:PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Optionnel pour CLI avancé
SUPABASE_PROJECT_ID=alsgdtewqeldrrquypdy
SUPABASE_URL=https://alsgdtewqeldrrquypdy.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

**Seul `DATABASE_URL` est requis pour les commandes psql directes !**

---

## 🔧 Troubleshooting

### "DATABASE_URL non définie"

```bash
# Charger les variables d'environnement
export $(cat envFiles/.env.development | xargs)

# Vérifier
echo $DATABASE_URL
# Doit afficher : postgresql://...

# Relancer la commande
make supabase-apply-rls
```

---

### "psql: could not connect"

```bash
# Vérifier que DATABASE_URL est correct
echo $DATABASE_URL

# Tester la connexion
make supabase-psql
# Si erreur → vérifier password dans DATABASE_URL
```

---

### "permission denied for table"

```bash
# Vérifier que vous utilisez le bon user (postgres.xxx)
# Le DATABASE_URL doit contenir postgres.PROJECT_REF
```

---

## 🎯 Exemples Concrets

### Créer une Migration Custom

```bash
# 1. Créer le fichier
cat > supabase/migrations/add_user_avatar.sql << 'EOF'
-- Add avatar column to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- Add index
CREATE INDEX IF NOT EXISTS "User_avatarUrl_idx" 
ON "User"("avatarUrl");
EOF

# 2. Appliquer
export $(cat envFiles/.env.development | xargs)
make supabase-run-sql
# Entrer : migrations/add_user_avatar.sql
```

---

### Vérifier une Policy Spécifique

```bash
make supabase-psql

# Dans psql
SELECT * FROM pg_policies 
WHERE tablename = 'Space' 
AND schemaname = 'public';

\q
```

---

### Désactiver RLS (pour debug)

```bash
make supabase-psql

# Dans psql
ALTER TABLE "Space" DISABLE ROW LEVEL SECURITY;

# Tester...

# Réactiver
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;

\q
```

---

## 📚 Ressources

- **Fichier RLS complet :** `supabase/rls-policies.sql`
- **Guide Supabase CLI :** `docs/SUPABASE_CLI.md`
- **Documentation PostgreSQL RLS :** https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## ✅ Résumé Ultra-Rapide

```bash
# Setup (1 fois)
export $(cat envFiles/.env.development | xargs)
make dev-up
make supabase-up
make supabase-apply-rls

# Vérifier
make supabase-check-rls

# Développer
# ... coder ...

# Si besoin de SQL custom
make supabase-run-sql
```

**3 commandes pour un setup complet !** 🚀

---

**Ces commandes utilisent IPv4 et sont 10x plus rapides que le Dashboard.** ⚡
