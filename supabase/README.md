# 📁 Dossier Supabase

Ce dossier contient toutes les ressources Supabase du projet.

---

## 📂 Structure

```
supabase/
├── config.toml                      # Configuration CLI Supabase
├── migrations/                      # Migrations SQL versionnées
│   └── 20241113000000_enable_rls_policies.sql
├── functions/                       # Edge Functions (optionnel)
│   └── .gitkeep
├── seed/                            # Données de test/seed
│   └── .gitkeep
├── rls-policies.sql                 # Fichier source RLS (référence)
└── README.md                        # Ce fichier
```

---

## 🎯 Utilisation

### Quick Start

```bash
# 1. Démarrer le CLI Supabase
make supabase-up

# 2. Lier votre projet Supabase
make supabase-link
# Entrer votre Project Ref depuis le Dashboard

# 3. Appliquer toutes les migrations
make supabase-db-push

# 4. Vérifier dans Supabase Dashboard
# → Database → Policies (RLS activé ✅)
```

---

## 📝 Migrations

### Créer une Nouvelle Migration

```bash
# Créer une migration vide
make supabase-migration-new
# Nom : "add_user_roles"

# Fichier créé : migrations/20241113123456_add_user_roles.sql
```

### Appliquer les Migrations

```bash
# Sur Supabase distant (dev/staging/prod)
make supabase-db-push
```

### Synchroniser depuis Supabase

```bash
# Si quelqu'un a modifié le schéma dans le Dashboard
make supabase-db-pull
```

---

## 🔒 RLS Policies

Le fichier `rls-policies.sql` contient toutes les policies Row-Level Security.

**Ces policies sont déjà dans `migrations/20241113000000_enable_rls_policies.sql`**

Pour les appliquer :

```bash
make supabase-db-push
```

Ou manuellement dans Dashboard :
1. SQL Editor → New Query
2. Copier le contenu de `rls-policies.sql`
3. Run

---

## ⚡ Edge Functions (Optionnel)

Créer et déployer des fonctions serverless Supabase.

```bash
# Créer une fonction
make supabase-functions-new
# Nom : "send-email"

# Déployer
make supabase-functions-deploy
# Nom : "send-email"
```

---

## 📚 Documentation

- **Guide complet** : [`docs/SUPABASE_CLI.md`](../docs/SUPABASE_CLI.md)
- **Commandes disponibles** : `make help | grep supabase`

---

## 🔗 Liens Utiles

- [Supabase Dashboard](https://app.supabase.com)
- [CLI Documentation](https://supabase.com/docs/guides/cli)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
