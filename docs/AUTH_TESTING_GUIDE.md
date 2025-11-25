# Guide de Test - Authentification & Onboarding

## 🔐 Architecture Auth

**Système:** Supabase Authentication + JWT

**Flow:**
1. Signup/Login via Supabase
2. Récupération du JWT token
3. Création organisation (onboarding)
4. Accès aux endpoints protégés

---

## 🚀 Test Complet - Étape par Étape

### Prérequis

**Variables d'environnement:**
```bash
# Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_anon_key
SUPABASE_JWT_SECRET=votre_jwt_secret

# API
API_URL=http://localhost:3000/api/v1
```

---

### Étape 1: Signup (Supabase)

**Via Supabase Client:**
```bash
curl -X POST https://votre-projet.supabase.co/auth/v1/signup \
  -H "apikey: VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

**Réponse:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": {
    "id": "uuid-user-id",
    "email": "test@example.com",
    "created_at": "2024-11-25T10:00:00Z"
  }
}
```

**Sauvegarder le token:**
```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export USER_ID="uuid-user-id"
```

---

### Étape 2: Login (Si déjà inscrit)

```bash
curl -X POST https://votre-projet.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

---

### Étape 3: Créer une Organisation (Onboarding)

**Endpoint:** `POST /api/v1/onboarding`

```bash
curl -X POST http://localhost:3000/api/v1/onboarding \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Ma Super Entreprise",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Réponse:**
```json
{
  "tenant": {
    "id": "tenant_abc123",
    "name": "Ma Super Entreprise",
    "slug": "ma-super-entreprise",
    "plan": "FREE",
    "status": "ACTIVE",
    "createdAt": "2024-11-25T10:00:00Z"
  },
  "user": {
    "id": "user_xyz789",
    "email": "test@example.com",
    "name": "John Doe",
    "firstName": "John",
    "fullName": "John Doe",
    "role": "ADMIN",
    "tenantId": "tenant_abc123"
  }
}
```

**Sauvegarder le tenant ID:**
```bash
export TENANT_ID="tenant_abc123"
```

---

### Étape 4: Vérifier l'Authentification

**Health Check:**
```bash
curl http://localhost:3000/api/v1/health
```

**Résultat:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

---

### Étape 5: Configurer Weezevent (Optionnel)

**Endpoint:** `PATCH /api/v1/onboarding/tenants/:tenantId/weezevent`

```bash
curl -X PATCH http://localhost:3000/api/v1/onboarding/tenants/$TENANT_ID/weezevent \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weezeventClientId": "votre_client_id",
    "weezeventClientSecret": "votre_client_secret",
    "weezeventEnabled": true
  }'
```

**Réponse:**
```json
{
  "id": "tenant_abc123",
  "name": "Ma Super Entreprise",
  "slug": "ma-super-entreprise",
  "weezeventClientId": "votre_client_id",
  "weezeventEnabled": true
}
```

---

## 🧪 Tests avec Postman/Insomnia

### Collection Postman

**1. Variables d'environnement:**
```json
{
  "supabase_url": "https://votre-projet.supabase.co",
  "supabase_anon_key": "votre_anon_key",
  "api_url": "http://localhost:3000/api/v1",
  "jwt_token": "",
  "tenant_id": ""
}
```

**2. Signup**
- Method: POST
- URL: `{{supabase_url}}/auth/v1/signup`
- Headers: `apikey: {{supabase_anon_key}}`
- Body:
```json
{
  "email": "test@example.com",
  "password": "SecurePassword123!"
}
```
- Tests (JavaScript):
```javascript
pm.environment.set("jwt_token", pm.response.json().access_token);
```

**3. Create Organization**
- Method: POST
- URL: `{{api_url}}/onboarding`
- Headers: `Authorization: Bearer {{jwt_token}}`
- Body:
```json
{
  "organizationName": "Test Org",
  "firstName": "John",
  "lastName": "Doe"
}
```
- Tests:
```javascript
pm.environment.set("tenant_id", pm.response.json().tenant.id);
```

---

## 🔍 Vérification Base de Données

### Via Prisma Studio

```bash
make dev-studio
```

**Tables à vérifier:**
1. **Tenant** - Organisation créée
2. **User** - Utilisateur créé avec role ADMIN

### Via psql

```bash
make supabase-psql
```

```sql
-- Vérifier les tenants
SELECT id, name, slug, plan, status FROM "Tenant";

-- Vérifier les users
SELECT id, email, name, role, "tenantId" FROM "User";

-- Vérifier la config Weezevent
SELECT id, name, "weezeventEnabled", "weezeventClientId" 
FROM "Tenant" 
WHERE "weezeventEnabled" = true;
```

---

## 🐛 Dépannage

### Erreur: "Unauthorized"

**Cause:** Token JWT invalide ou expiré

**Solution:**
```bash
# Re-login pour obtenir un nouveau token
curl -X POST https://votre-projet.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: VOTRE_ANON_KEY" \
  -d '{"email":"test@example.com","password":"SecurePassword123!"}'
```

### Erreur: "Organization already exists"

**Cause:** L'utilisateur a déjà créé une organisation

**Solution:**
```bash
# Vérifier dans la base de données
SELECT * FROM "User" WHERE email = 'test@example.com';
```

### Erreur: "SUPABASE_JWT_SECRET not configured"

**Cause:** Variable d'environnement manquante

**Solution:**
```bash
# Ajouter dans envFiles/.env.development
SUPABASE_JWT_SECRET=votre_jwt_secret_depuis_supabase
```

---

## 📝 Script de Test Complet

```bash
#!/bin/bash

# Configuration
SUPABASE_URL="https://votre-projet.supabase.co"
SUPABASE_KEY="votre_anon_key"
API_URL="http://localhost:3000/api/v1"
EMAIL="test-$(date +%s)@example.com"  # Email unique
PASSWORD="SecurePassword123!"

echo "🔐 Test Authentification & Onboarding"
echo "======================================"

# 1. Signup
echo ""
echo "1️⃣ Signup..."
SIGNUP_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

JWT_TOKEN=$(echo $SIGNUP_RESPONSE | jq -r '.access_token')

if [ "$JWT_TOKEN" = "null" ]; then
  echo "❌ Signup failed"
  echo $SIGNUP_RESPONSE | jq
  exit 1
fi

echo "✅ Signup successful"
echo "Token: ${JWT_TOKEN:0:20}..."

# 2. Create Organization
echo ""
echo "2️⃣ Creating organization..."
ORG_RESPONSE=$(curl -s -X POST "$API_URL/onboarding" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Organization",
    "firstName": "John",
    "lastName": "Doe"
  }')

TENANT_ID=$(echo $ORG_RESPONSE | jq -r '.tenant.id')

if [ "$TENANT_ID" = "null" ]; then
  echo "❌ Organization creation failed"
  echo $ORG_RESPONSE | jq
  exit 1
fi

echo "✅ Organization created"
echo "Tenant ID: $TENANT_ID"

# 3. Health Check
echo ""
echo "3️⃣ Health check..."
HEALTH=$(curl -s "$API_URL/health")
echo $HEALTH | jq

# 4. Summary
echo ""
echo "✅ Test completed successfully!"
echo "======================================"
echo "Email: $EMAIL"
echo "Password: $PASSWORD"
echo "JWT Token: ${JWT_TOKEN:0:30}..."
echo "Tenant ID: $TENANT_ID"
echo ""
echo "💾 Save these credentials for further testing"
```

**Utilisation:**
```bash
chmod +x test-auth.sh
./test-auth.sh
```

---

## 🎯 Endpoints Disponibles

### Public (Sans Auth)
- `GET /api/v1/health` - Health check

### Onboarding (JWT Supabase)
- `POST /api/v1/onboarding` - Créer organisation
- `PATCH /api/v1/onboarding/tenants/:id/weezevent` - Config Weezevent
- `GET /api/v1/onboarding/tenants/:id/weezevent` - Get config Weezevent
- `PATCH /api/v1/onboarding/tenants/:id/webhook` - Config webhook
- `GET /api/v1/onboarding/tenants/:id/webhook` - Get config webhook

### Weezevent (JWT Database)
- `GET /api/v1/weezevent/transactions` - Liste transactions
- `GET /api/v1/weezevent/transactions/:id` - Détail transaction
- `GET /api/v1/weezevent/events` - Liste événements
- `GET /api/v1/weezevent/products` - Liste produits
- `POST /api/v1/weezevent/sync` - Sync manuelle
- `GET /api/v1/weezevent/sync/status` - Statut sync

### Webhooks (Public avec signature)
- `POST /api/v1/webhooks/weezevent/:tenantId` - Recevoir webhook

---

## 📚 Documentation Supabase

**Obtenir vos credentials:**
1. Dashboard Supabase: https://app.supabase.com
2. Settings → API
3. Copier:
   - Project URL
   - anon/public key
   - JWT Secret (pour backend)

**Documentation:**
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [JWT Tokens](https://supabase.com/docs/guides/auth/auth-helpers/auth-ui)

---

## ✅ Checklist de Test

- [ ] Signup fonctionne
- [ ] Login fonctionne
- [ ] Token JWT valide
- [ ] Création organisation réussie
- [ ] Tenant créé en base
- [ ] User créé avec role ADMIN
- [ ] Config Weezevent fonctionne
- [ ] Endpoints protégés accessibles
- [ ] Health check OK

---

**🎉 Prêt à tester l'authentification !**
