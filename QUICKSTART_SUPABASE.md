# ⚡ Démarrage Rapide - Supabase CLI

Guide ultra-rapide pour mettre en place le CLI Supabase et appliquer les RLS policies.

---

## 🎯 Objectif

Appliquer les **RLS policies** et configurer le CLI Supabase en **moins de 10 minutes**.

---

## ✅ Prérequis

- Docker Desktop lancé
- Compte Supabase avec un projet créé
- Fichiers `.env` configurés (voir `.env.example`)

---

## 🚀 Étapes (10 min)

### 1. Configurer les Variables d'Environnement (2 min)

Ouvrir votre fichier `.env` (ou `envFiles/.env.development`) et ajouter :

```bash
# Dashboard → Settings → General → Reference ID
SUPABASE_PROJECT_ID=votre-project-ref

# Dashboard → Settings → Database → Database Password
SUPABASE_DB_PASSWORD=votre-db-password

# Dashboard → Settings → API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...

# Database URL (Connection Pooler)
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Trouver ces valeurs :**
1. Ouvrir [Supabase Dashboard](https://app.supabase.com)
2. Sélectionner votre projet
3. Settings → General → Reference ID = `SUPABASE_PROJECT_ID`
4. Settings → Database → Connection string = `DATABASE_URL`
5. Settings → Database → Database Password = `SUPABASE_DB_PASSWORD`
6. Settings → API → URL et Keys

---

### 2. Construire et Démarrer le CLI (2 min)

```bash
# Charger les variables d'environnement
export $(cat .env | xargs)  # ou envFiles/.env.development

# Construire l'image Supabase CLI
docker-compose build supabase-cli

# Démarrer le conteneur
make supabase-up

# Vérifier que le CLI est prêt
make supabase-status
```

**Résultat attendu :**
```
🚀 Démarrage Supabase CLI...
✅ Supabase CLI prêt
```

---

### 3. Lier le Projet Supabase (1 min)

```bash
# Lier le projet local au projet Supabase distant
make supabase-link

# Entrer le Project Ref quand demandé
# Exemple : abcdefghijklmnop
```

**Alternative manuelle :**

```bash
# Ouvrir le shell CLI
make supabase-shell

# Dans le shell :
supabase link --project-ref VOTRE_PROJECT_REF

# Sortir du shell
exit
```

**Vérifier :**

```bash
make supabase-status
# Doit afficher : Project ID: xxxxx
```

---

### 4. Appliquer les RLS Policies (2 min) ⭐

```bash
# Appliquer toutes les migrations (incluant RLS)
make supabase-db-push
```

**Résultat attendu :**
```
🚀 Application des migrations à Supabase...
Applying migration 20241113000000_enable_rls_policies.sql...
✅ Migrations appliquées
```

---

### 5. Vérifier dans Supabase Dashboard (1 min)

1. Ouvrir [Supabase Dashboard](https://app.supabase.com)
2. Sélectionner votre projet
3. **Database** → **Policies**
4. Vérifier que vous voyez :
   - ✅ Tenant policies (SELECT, INSERT, UPDATE, DELETE)
   - ✅ User policies
   - ✅ Space policies
   - ✅ Supplier policies
   - ✅ Product policies
   - ✅ Config policies
   - etc.

**Vérification SQL :**

Dans **SQL Editor** → **New Query** :

```sql
-- Compter le nombre de policies RLS
SELECT count(*) FROM pg_policies WHERE schemaname='public';

-- Résultat attendu : 50+ policies
```

---

## ✅ C'EST FAIT !

Votre CLI Supabase est configuré et les RLS policies sont appliquées ! 🎉

---

## 🔄 Workflow Quotidien

### Créer une Nouvelle Migration

```bash
# 1. Créer une migration vide
make supabase-migration-new
# Nom : "add_user_avatar"

# 2. Éditer le fichier généré
# supabase/migrations/20241113XXXXXX_add_user_avatar.sql

# 3. Appliquer sur Supabase
make supabase-db-push

# 4. Commit dans Git
git add supabase/migrations/
git commit -m "feat: add user avatar column"
```

### Synchroniser avec Prisma

```bash
# 1. Modifier schema.prisma
# Ajouter un nouveau champ

# 2. Appliquer avec Prisma
make prisma-migrate
# Nom : "add_user_avatar"

# 3. Générer migration Supabase depuis les diffs
make supabase-db-diff
# Nom : "sync_prisma_avatar"

# 4. Pousser vers Supabase
make supabase-db-push
```

---

## 📚 Commandes Utiles

```bash
# Démarrer CLI
make supabase-up

# Shell interactif
make supabase-shell

# Créer migration
make supabase-migration-new

# Appliquer migrations
make supabase-db-push

# Récupérer schéma distant
make supabase-db-pull

# Backup SQL
make supabase-db-dump

# Status
make supabase-status

# Voir toutes les commandes
make help | grep supabase
```

---

## 🆘 Problèmes Courants

### "Cannot connect to project"

```bash
# Vérifier les variables d'environnement
echo $SUPABASE_PROJECT_ID
echo $SUPABASE_DB_PASSWORD

# Re-lier le projet
make supabase-link
```

### "Migration already applied"

```bash
# Forcer la synchronisation
make supabase-shell
# Dans le shell :
supabase db push --include-all
```

### "Container not found"

```bash
# Redémarrer le conteneur CLI
docker-compose --profile tools down
make supabase-up
```

---

## 📖 Documentation Complète

Pour aller plus loin : [`docs/SUPABASE_CLI.md`](./docs/SUPABASE_CLI.md)

---

## 🎯 Prochaines Étapes

Maintenant que le CLI Supabase est configuré, passez à la **Phase 1 - Sécurité** :

1. ✅ RLS policies appliquées
2. ⏳ Créer module Auth NestJS
3. ⏳ Implémenter middleware Prisma tenant
4. ⏳ Tests isolation tenants

**Guide complet :** [`docs/PHASE1_SECURITY.md`](./docs/PHASE1_SECURITY.md)

---

**CLI Supabase opérationnel !** 🚀🔒
