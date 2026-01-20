# 🚀 Guide de Démarrage Rapide - Test Auth

## ✅ Statut des Features

### Authentification ✅
- **Signup** - Via Supabase
- **Login** - Via Supabase  
- **JWT Strategy** - Configuré
- **Guards** - JwtOnboardingGuard, JwtDatabaseGuard

### Onboarding ✅
- **Create Organization** - `POST /onboarding`
- **Weezevent Config** - `PATCH /onboarding/tenants/:id/weezevent`
- **Webhook Config** - `PATCH /onboarding/tenants/:id/webhook`

---

## 🧪 Test Rapide (2 minutes)

### Prérequis

**1. Variables d'environnement:**
```bash
export SUPABASE_URL="https://votre-projet.supabase.co"
export SUPABASE_ANON_KEY="votre_anon_key"
```

**2. API démarrée:**
```bash
make quickstart
# Ou
make dev-up
```

---

### Option 1: Script Automatique

```bash
# Lancer le test
./scripts/test-auth-quick.sh
```

**Résultat attendu:**
```
🧪 Test Authentification DataFriday
========================================

1️⃣ Health Check...
✅ API is healthy

2️⃣ Signup...
✅ Signup successful
   Token: eyJhbGciOiJIUzI1NiIsInR5cCI6...

3️⃣ Creating organization...
✅ Organization created
   Tenant ID: cly8x9z0a0000...
   User ID: cly8x9z0b0001...

✅ All tests passed!
```

---

### Option 2: Test Manuel

**1. Health Check**
```bash
curl http://localhost:3000/api/v1/health
```

**2. Signup**
```bash
curl -X POST https://votre-projet.supabase.co/auth/v1/signup \
  -H "apikey: VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

Sauvegarder le `access_token` retourné.

**3. Create Organization**
```bash
export JWT_TOKEN="votre_access_token"

curl -X POST http://localhost:3000/api/v1/onboarding \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Org",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

---

## 📋 Endpoints Disponibles

### Public
- ✅ `GET /api/v1/health` - Health check

### Onboarding (JWT Supabase)
- ✅ `POST /api/v1/onboarding` - Créer organisation
- ✅ `PATCH /api/v1/onboarding/tenants/:id/weezevent` - Config Weezevent
- ✅ `GET /api/v1/onboarding/tenants/:id/weezevent` - Get config
- ✅ `PATCH /api/v1/onboarding/tenants/:id/webhook` - Config webhook
- ✅ `GET /api/v1/onboarding/tenants/:id/webhook` - Get webhook config

### Weezevent (JWT Database)
- ✅ `GET /api/v1/weezevent/transactions` - Liste transactions
- ✅ `POST /api/v1/weezevent/sync` - Synchronisation manuelle
- ✅ `GET /api/v1/weezevent/events` - Liste événements

### Webhooks (Public + Signature)
- ✅ `POST /api/v1/webhooks/weezevent/:tenantId` - Recevoir webhook

---

## 🔍 Vérification

### Via Prisma Studio
```bash
make dev-studio
```

Vérifier:
- Table `Tenant` - Organisation créée
- Table `User` - Utilisateur avec role ADMIN

### Via Logs
```bash
make dev-logs
```

---

## ⚙️ Configuration Requise

### Variables d'environnement (.env.development)

```bash
# Supabase (REQUIS)
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=votre-supabase-jwt-secret

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Encryption (pour Weezevent)
ENCRYPTION_KEY=0123456789abcdef...
```

**Obtenir les credentials Supabase:**
1. Dashboard: https://app.supabase.com
2. Settings → API
3. Copier URL, anon key, JWT secret

---

## 🐛 Dépannage

### "Unauthorized"
```bash
# Vérifier JWT_SECRET dans .env
echo $JWT_SECRET

# Re-login
curl -X POST $SUPABASE_URL/auth/v1/token?grant_type=password \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -d '{"email":"test@example.com","password":"SecurePassword123!"}'
```

### "Cannot connect to database"
```bash
# Vérifier la connexion
make dev-logs

# Redémarrer
make dev-down && make dev-up
```

### "Organization already exists"
```bash
# Utiliser un email différent ou vérifier en DB
make dev-studio
```

---

## 📚 Documentation Complète

- [AUTH_TESTING_GUIDE.md](./AUTH_TESTING_GUIDE.md) - Guide complet
- [docs/auth/](./docs/auth/) - Documentation auth détaillée

---

## ✅ Checklist

- [ ] Variables Supabase configurées
- [ ] API démarrée (`make quickstart`)
- [ ] Health check OK
- [ ] Signup fonctionne
- [ ] Organisation créée
- [ ] Tenant en base de données
- [ ] User avec role ADMIN

---

**🎉 Prêt à tester !**
