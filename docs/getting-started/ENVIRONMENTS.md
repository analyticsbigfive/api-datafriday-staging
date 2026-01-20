# 🌍 Guide des Environnements - 3 Supabase

## Architecture Multi-Environnements

Le projet utilise **3 projets Supabase séparés** pour isolation complète:

```
Development  → Supabase Project #1
Staging      → Supabase Project #2
Production   → Supabase Project #3
```

**Aucune base de données locale PostgreSQL** - Tout passe par Supabase.

---

## 📋 Configuration Requise

### 1. Créer les 3 projets Supabase

1. Aller sur https://app.supabase.com
2. Créer 3 projets:
   - **datafriday-dev** (Development)
   - **datafriday-staging** (Staging)  
   - **datafriday-prod** (Production)

### 2. Récupérer les credentials pour chaque projet

Pour chaque projet Supabase:

**Dashboard → Settings → Database → Connection string → URI**

Format (Connection Pooler recommandé):
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Dashboard → Settings → API:**
- URL: `https://[PROJECT_REF].supabase.co`
- anon key: Clé publique
- service_role: Clé secrète

### 3. Configurer les fichiers .env

#### `.env.development`
```env
NODE_ENV=development
DATABASE_URL="postgresql://postgres.DEV_REF:DEV_PASSWORD@..."
SUPABASE_URL=https://DEV_REF.supabase.co
SUPABASE_ANON_KEY=dev-anon-key
SUPABASE_SERVICE_ROLE_KEY=dev-service-role-key
LOG_LEVEL=debug
```

#### `.env.staging`
```env
NODE_ENV=staging
DATABASE_URL="postgresql://postgres.STAGING_REF:STAGING_PASSWORD@..."
SUPABASE_URL=https://STAGING_REF.supabase.co
SUPABASE_ANON_KEY=staging-anon-key
SUPABASE_SERVICE_ROLE_KEY=staging-service-role-key
LOG_LEVEL=info
```

#### `.env.production`
```env
NODE_ENV=production
DATABASE_URL="postgresql://postgres.PROD_REF:PROD_PASSWORD@..."
SUPABASE_URL=https://PROD_REF.supabase.co
SUPABASE_ANON_KEY=prod-anon-key
SUPABASE_SERVICE_ROLE_KEY=prod-service-role-key
LOG_LEVEL=warn
```

---

## 🚀 Utilisation

### DEVELOPMENT

```bash
# Démarrer
make dev-up

# Appliquer migrations
make dev-migrate

# Peupler avec données test
make dev-seed

# Prisma Studio (interface DB)
make dev-studio
# → http://localhost:5555

# Voir les logs
make dev-logs

# Arrêter
make dev-down
```

**Port:** 3000  
**Base:** Supabase Development  
**Logs:** debug  

---

### STAGING

```bash
# Démarrer
make staging-up

# Appliquer migrations (deploy only)
make staging-migrate

# Seed (si nécessaire)
make staging-seed

# Logs
make staging-logs

# Arrêter
make staging-down
```

**Port:** 3000  
**Base:** Supabase Staging  
**Logs:** info  
**Usage:** Tests pré-production, validation client

---

### PRODUCTION

```bash
# Démarrer
make prod-up

# Appliquer migrations
make prod-migrate

# ⚠️ Seed (rarement utilisé en prod!)
make prod-seed

# Logs
make prod-logs

# Arrêter
make prod-down
```

**Port:** 3000  
**Base:** Supabase Production  
**Logs:** warn  
**Usage:** Environnement live

---

## 📊 Tableau des commandes

| Commande | Development | Staging | Production |
|----------|------------|---------|------------|
| **Démarrer** | `make dev-up` | `make staging-up` | `make prod-up` |
| **Arrêter** | `make dev-down` | `make staging-down` | `make prod-down` |
| **Logs** | `make dev-logs` | `make staging-logs` | `make prod-logs` |
| **Migrations** | `make dev-migrate` | `make staging-migrate` | `make prod-migrate` |
| **Seed** | `make dev-seed` | `make staging-seed` | `make prod-seed` |
| **Prisma Studio** | `make dev-studio` | - | - |

---

## 🔄 Workflow Typique

### Développement d'une feature

```bash
# 1. Développer localement (Supabase DEV)
make dev-up
make dev-migrate

# Modifier le code...

# 2. Tester en staging
make dev-down
make staging-up
make staging-migrate

# Valider...

# 3. Déployer en production
make staging-down
make prod-up
make prod-migrate
```

---

## 🗄️ Migrations Prisma

### Créer une nouvelle migration (DEV)

```bash
# En développement
make dev-up

# Modifier prisma/schema.prisma

# Créer la migration
docker-compose --env-file .env.development exec api npx prisma migrate dev --name add_new_feature

# Test
make dev-seed
```

### Appliquer en STAGING

```bash
make staging-migrate
# Applique toutes les migrations non appliquées
```

### Appliquer en PRODUCTION

```bash
# ⚠️ Faire un backup avant!
make prod-migrate
```

---

## 🔐 Sécurité par Environnement

### Development
- ✅ Logs debug
- ✅ CORS permissif
- ✅ Seed avec données test
- ✅ Prisma Studio accessible

### Staging
- ✅ Logs info
- ✅ CORS limité (staging.domain.com)
- ⚠️ Pas de Prisma Studio exposé
- ⚠️ Backup avant migrations

### Production
- ✅ Logs warn/error only
- ✅ CORS strict (domain.com)
- ❌ Pas de Prisma Studio
- ❌ Seed désactivé par défaut
- ✅ Backup automatique Supabase
- ✅ Health checks actifs

---

## 🎯 Vérifications de Santé

### Check Development
```bash
curl http://localhost:3000/api/v1/health
# → {"status":"ok","environment":"development"}
```

### Check Staging
```bash
curl http://staging.yourdomain.com/api/v1/health
# → {"status":"ok","environment":"staging"}
```

### Check Production
```bash
curl https://api.yourdomain.com/api/v1/health
# → {"status":"ok","environment":"production"}
```

---

## 📁 Structure des Fichiers

```
api-datafriday/
├── .env.development        # Config dev
├── .env.staging           # Config staging
├── .env.production        # Config prod
├── docker-compose.yml     # Dev (default)
├── docker-compose.staging.yml
├── docker-compose.production.yml
├── Makefile               # Commandes pour les 3 envs
└── prisma/
    ├── schema.prisma
    ├── migrations/        # Partagées entre tous les envs
    └── seed.ts
```

---

## ⚠️ Points d'Attention

### Ne JAMAIS:
- ❌ Commit les fichiers `.env.*` (gitignored)
- ❌ Utiliser les credentials de PROD en DEV
- ❌ Tester des migrations directement en PROD
- ❌ Exposer les `service_role` keys
- ❌ Seed la base PROD sans backup

### Toujours:
- ✅ Tester en DEV → STAGING → PROD
- ✅ Backup avant migrations PROD
- ✅ Utiliser Connection Pooler en PROD
- ✅ Vérifier les logs après déploiement
- ✅ Activer RLS (Row Level Security) sur Supabase

---

## 🔄 Synchronisation des Schémas

Pour synchroniser le schéma entre environnements:

```bash
# 1. Développer et migrer en DEV
make dev-migrate

# 2. Tester en STAGING (applique toutes les migrations)
make staging-migrate

# 3. Valider puis appliquer en PROD
make prod-migrate
```

**Les migrations sont partagées** - Une fois créée en dev, la même migration s'applique partout.

---

## 🆘 Troubleshooting

### Erreur de connexion

```bash
# Tester la connexion manuellement
docker run --rm -e DATABASE_URL="your-url" node:20-alpine \
  npx prisma db execute --stdin <<< "SELECT 1"
```

### Migrations bloquées

```bash
# Réinitialiser l'état des migrations (DEV only!)
docker-compose --env-file .env.development exec api \
  npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

### Voir les migrations appliquées

```bash
# En développement
docker-compose --env-file .env.development exec api \
  npx prisma migrate status
```

---

## 📊 Monitoring

### Supabase Dashboard

Chaque projet a son dashboard:
- **Development:** https://app.supabase.com/project/dev-ref
- **Staging:** https://app.supabase.com/project/staging-ref
- **Production:** https://app.supabase.com/project/prod-ref

Vérifier:
- Database → Reports (performance)
- Database → Logs (requêtes SQL)
- Settings → Database → Connection pooling

---

## 🎉 Résumé

Vous avez maintenant **3 environnements complètement isolés**:

- 🔧 **DEV** - Développement et tests
- 🚧 **STAGING** - Validation pré-production
- 🚀 **PROD** - Production live

Chacun avec sa propre base Supabase, pas de PostgreSQL local ! 🎯
