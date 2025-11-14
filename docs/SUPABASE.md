# 🔧 Guide Supabase CLI - Gestion des Migrations

Ce guide explique comment utiliser le CLI Supabase pour gérer vos migrations, fonctions edge, et configurations.

---

## 🎯 Pourquoi Supabase CLI ?

Le CLI Supabase vous permet de :
- ✅ **Gérer les migrations SQL** de manière versionnée
- ✅ **Synchroniser** le schéma local ↔ distant
- ✅ **Créer et déployer** Edge Functions
- ✅ **Exporter/Importer** des données
- ✅ **Appliquer les RLS policies** de manière automatisée
- ✅ **Travailler en équipe** avec des migrations versionnées (Git)

---

## 📦 Installation (100% Docker)

Le CLI Supabase est déjà intégré dans un conteneur Docker dédié.

```bash
# Démarrer le conteneur Supabase CLI
make supabase-up

# Vérifier que le CLI est prêt
make supabase-status
```

---

## 🔗 Configuration Initiale

### 1. Lier votre projet Supabase

Chaque environnement (dev/staging/prod) doit être lié à son projet Supabase.

```bash
# Démarrer le CLI
make supabase-up

# Lier le projet (vous serez invité à entrer le Project Ref)
make supabase-link

# Ou manuellement :
make supabase-shell
# Dans le shell :
supabase link --project-ref <YOUR_PROJECT_REF>
```

**Trouver votre Project Ref :**
1. Ouvrir [Supabase Dashboard](https://app.supabase.com)
2. Sélectionner votre projet
3. Settings → General → Reference ID

### 2. Variables d'environnement

Assurez-vous que votre fichier `.env` (ou `envFiles/.env.development`) contient :

```bash
# Supabase Configuration
SUPABASE_PROJECT_ID=your-project-ref
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
SUPABASE_DB_PASSWORD=your-db-password

# Database URL (Pooler)
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

---

## 📝 Créer une Migration

### Méthode 1 : Migration Vide (pour SQL manuel)

```bash
# Créer une nouvelle migration
make supabase-migration-new
# Entrer : "add_user_roles"

# Fichier créé : supabase/migrations/20241113123456_add_user_roles.sql
```

Éditez le fichier généré :

```sql
-- supabase/migrations/20241113123456_add_user_roles.sql

-- Add role column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'member';

-- Add check constraint
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" 
  CHECK (role IN ('admin', 'member', 'guest'));

-- Create index
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
```

### Méthode 2 : Détecter les Différences (basé sur Prisma)

Si vous avez modifié votre `schema.prisma` et appliqué les changements :

```bash
# 1. Appliquer les changements Prisma (génère le schéma DB)
make prisma-migrate
# Nom : "add_user_roles"

# 2. Générer une migration Supabase depuis les différences
make supabase-db-diff
# Nom : "sync_prisma_user_roles"

# Le CLI détecte automatiquement les changements et crée la migration
```

---

## 🚀 Appliquer les Migrations

### Sur Supabase Distant (Development)

```bash
# Appliquer toutes les migrations locales à Supabase
make supabase-db-push

# Vérifier dans Supabase Dashboard → SQL Editor
```

### Workflow Complet (Dev → Staging → Prod)

```bash
# 1. Développement
make supabase-migration-new  # Créer migration
# Éditer supabase/migrations/xxxxx.sql
make supabase-db-push        # Appliquer sur dev

# 2. Commit Git
git add supabase/migrations/
git commit -m "feat: add user roles migration"
git push

# 3. Staging
# Changer env pour staging
make supabase-link           # Lier au projet staging
make supabase-db-push        # Appliquer sur staging

# 4. Production
# Changer env pour prod
make supabase-link           # Lier au projet prod
make supabase-db-push        # Appliquer sur prod
```

---

## 📥 Récupérer le Schéma Distant

Si votre collègue ou vous avez modifié le schéma directement dans Supabase Dashboard :

```bash
# Récupérer le schéma complet depuis Supabase
make supabase-db-pull

# Génère automatiquement les migrations manquantes
```

---

## 🔍 Commandes Utiles

### Vérifier le Statut

```bash
# Afficher les informations du projet lié
make supabase-status

# Ouvrir un shell dans le conteneur CLI
make supabase-shell

# Dans le shell :
supabase --version
supabase projects list
supabase migration list
```

### Créer un Backup

```bash
# Export SQL complet de la DB distante
make supabase-db-dump

# Fichier créé : supabase/backup_20241113_143022.sql
```

### Comparer Local ↔ Distant

```bash
# Ouvrir le shell CLI
make supabase-shell

# Comparer les schémas
supabase db diff --schema public

# Créer migration depuis les différences
supabase db diff -f sync_remote_changes
```

---

## ⚡ Edge Functions (Optionnel)

### Créer une Edge Function

```bash
# Créer une nouvelle fonction
make supabase-functions-new
# Nom : "send-email"

# Fichier créé : supabase/functions/send-email/index.ts
```

Exemple de fonction :

```typescript
// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { to, subject, body } = await req.json()
  
  // Logique d'envoi d'email
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } },
  )
})
```

### Déployer une Edge Function

```bash
# Déployer sur Supabase
make supabase-functions-deploy
# Nom : "send-email"

# URL accessible :
# https://xxxxx.supabase.co/functions/v1/send-email
```

---

## 🔄 Workflow Multi-Environnement

### Setup Recommandé

```
projet/
├── supabase/
│   ├── config.toml                  # Config CLI
│   ├── migrations/                  # Migrations versionnées (Git)
│   │   ├── 20241113000000_enable_rls_policies.sql
│   │   ├── 20241113010000_add_user_roles.sql
│   │   └── ...
│   ├── functions/                   # Edge Functions (optionnel)
│   └── seed/                        # Données de test
└── envFiles/
    ├── .env.development             # Project Ref dev
    ├── .env.staging                 # Project Ref staging
    └── .env.production              # Project Ref prod
```

### Changer d'Environnement

```bash
# 1. Charger les variables d'environnement
export $(cat envFiles/.env.development | xargs)

# 2. Redémarrer le CLI avec le bon env
docker-compose --profile tools down
make supabase-up

# 3. Lier au projet correspondant
make supabase-link
# Entrer le Project Ref de dev

# 4. Appliquer les migrations
make supabase-db-push
```

---

## 🛡️ Appliquer les RLS Policies

### Depuis les Migrations

Votre fichier `supabase/migrations/20241113000000_enable_rls_policies.sql` contient déjà toutes les policies RLS.

```bash
# Appliquer les RLS policies (incluses dans les migrations)
make supabase-db-push

# Vérifier dans Supabase Dashboard → Database → Policies
```

### Depuis le Dashboard (alternative)

1. Ouvrir Supabase Dashboard
2. SQL Editor → New Query
3. Copier le contenu de `supabase/rls-policies.sql`
4. Exécuter

---

## 🧪 Tester les Migrations Localement

**Note :** Pour tester localement avec `supabase start`, vous auriez besoin de Docker Desktop avec beaucoup de RAM (>8GB).

Pour un workflow simple, il est recommandé de :
1. Tester sur votre projet Supabase **Development**
2. Valider avec des tests e2e
3. Promouvoir vers Staging/Prod

---

## 📊 Intégration CI/CD

### GitHub Actions Example

```yaml
# .github/workflows/deploy-migrations.yml
name: Deploy Supabase Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Link to Supabase Project
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      
      - name: Push Migrations
        run: supabase db push
```

---

## 🚨 Troubleshooting

### Erreur : "Cannot find project"

```bash
# Vérifier que le projet est lié
make supabase-shell
supabase projects list

# Re-lier si nécessaire
supabase link --project-ref YOUR_PROJECT_REF
```

### Erreur : "Migration already applied"

```bash
# Lister les migrations appliquées
supabase migration list

# Forcer la synchronisation
supabase db push --include-all
```

### Erreur : "Database connection failed"

```bash
# Vérifier les variables d'environnement
echo $SUPABASE_URL
echo $SUPABASE_DB_PASSWORD

# Vérifier que le projet Supabase n'est pas en pause
# Dashboard → Settings → Pause/Resume
```

---

## 📚 Commandes Makefile Disponibles

| Commande | Description |
|----------|-------------|
| `make supabase-up` | Démarre le conteneur CLI |
| `make supabase-shell` | Ouvre un shell dans le conteneur |
| `make supabase-migration-new` | Crée une nouvelle migration |
| `make supabase-db-push` | Applique les migrations distantes |
| `make supabase-db-pull` | Récupère le schéma distant |
| `make supabase-db-diff` | Génère migration depuis différences |
| `make supabase-link` | Lie le projet local au distant |
| `make supabase-status` | Affiche le statut du CLI |
| `make supabase-functions-new` | Crée une Edge Function |
| `make supabase-functions-deploy` | Déploie une Edge Function |
| `make supabase-db-dump` | Export SQL complet |

---

## 🎯 Best Practices

### ✅ À Faire

- ✅ **Versionner** les migrations dans Git
- ✅ **Nommer clairement** les migrations (ex: `add_user_roles`, `enable_rls_spaces`)
- ✅ **Tester** sur dev avant staging/prod
- ✅ **Documenter** les migrations complexes avec des commentaires SQL
- ✅ **Utiliser des transactions** dans les migrations
- ✅ **Créer des migrations idempotentes** (IF NOT EXISTS, IF EXISTS)

### ❌ À Éviter

- ❌ **Modifier** une migration déjà appliquée en prod
- ❌ **Exécuter** du SQL directement en prod sans migration
- ❌ **Oublier** de commit les migrations dans Git
- ❌ **Déployer** sans tester sur staging
- ❌ **Utiliser** DROP sans vérifications

---

## 🔗 Ressources

- [Documentation Supabase CLI](https://supabase.com/docs/guides/cli)
- [Migration Management](https://supabase.com/docs/guides/cli/managing-environments)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## ✅ Prochaines Étapes

1. **Démarrer le CLI** : `make supabase-up`
2. **Lier votre projet** : `make supabase-link`
3. **Appliquer les RLS** : `make supabase-db-push`
4. **Vérifier dans Dashboard** : Policies activées ✅

**Le CLI Supabase est maintenant prêt !** 🚀
