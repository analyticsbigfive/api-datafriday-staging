#!/bin/bash

# 🧪 Script de Test Authentification
# Usage: ./test-auth-quick.sh

set -e

# Charger les variables d'environnement depuis .env.development
ENV_FILE="envFiles/.env.development"

if [ -f "$ENV_FILE" ]; then
  echo "📂 Chargement des variables depuis $ENV_FILE..."
  # Exporter les variables nécessaires
  export $(grep -E "^(SUPABASE_URL|SUPABASE_ANON_KEY)=" "$ENV_FILE" | xargs)
fi

# Configuration
API_URL="${API_URL:-http://localhost:3000/api/v1}"
SUPABASE_URL="${SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_ANON_KEY}"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Test Authentification DataFriday${NC}"
echo "========================================"
echo ""

# Vérifier les variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo -e "${RED}❌ Variables manquantes${NC}"
  echo "Vérifiez que $ENV_FILE contient:"
  echo "  SUPABASE_URL=https://votre-projet.supabase.co"
  echo "  SUPABASE_ANON_KEY=votre_anon_key"
  exit 1
fi

# Email unique pour le test
EMAIL="ulrich@bigfiveabidjan.com"
PASSWORD="SecurePassword123!"

echo -e "${BLUE}📧 Email de test: $EMAIL${NC}"
echo ""

# 1. Health Check
echo -e "${BLUE}1️⃣ Health Check...${NC}"
HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}✅ API is healthy${NC}"
else
  echo -e "${RED}❌ API health check failed${NC}"
  exit 1
fi
echo ""

# 2. Signup
echo -e "${BLUE}2️⃣ Signup...${NC}"
SIGNUP_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

# Vérifier si l'utilisateur existe déjà et faire login
USER_ID=$(echo $SIGNUP_RESPONSE | jq -r '.id // .user.id // empty')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ Signup failed${NC}"
  echo "$SIGNUP_RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✅ User created/exists: $USER_ID${NC}"

# 2b. Login pour obtenir le token
echo -e "${BLUE}2b️⃣ Login to get token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

JWT_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')

if [ "$JWT_TOKEN" = "null" ] || [ -z "$JWT_TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo "$LOGIN_RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "   Token: ${JWT_TOKEN:0:30}..."
echo ""

# 3. Create Organization
echo -e "${BLUE}3️⃣ Creating organization...${NC}"
ORG_RESPONSE=$(curl -s -X POST "$API_URL/onboarding" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Organization",
    "firstName": "John",
    "lastName": "Doe"
  }')

TENANT_ID=$(echo $ORG_RESPONSE | jq -r '.tenant.id')
USER_ID=$(echo $ORG_RESPONSE | jq -r '.user.id')

if [ "$TENANT_ID" = "null" ] || [ -z "$TENANT_ID" ]; then
  echo -e "${RED}❌ Organization creation failed${NC}"
  echo "$ORG_RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✅ Organization created${NC}"
echo "   Tenant ID: $TENANT_ID"
echo "   User ID: $USER_ID"
echo ""

# 4. Summary
echo -e "${GREEN}✅ All tests passed!${NC}"
echo "========================================"
echo ""
echo "📝 Credentials:"
echo "   Email:    $EMAIL"
echo "   Password: $PASSWORD"
echo "   JWT:      ${JWT_TOKEN:0:40}..."
echo "   Tenant:   $TENANT_ID"
echo ""
echo "💡 Next steps:"
echo "   export JWT_TOKEN='$JWT_TOKEN'"
echo "   export TENANT_ID='$TENANT_ID'"
echo ""
echo "   # Test Weezevent config"
echo "   curl -X PATCH $API_URL/organizations/\$TENANT_ID/integrations/weezevent \\"
echo "     -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"weezeventClientId\":\"test\",\"weezeventClientSecret\":\"secret\",\"weezeventEnabled\":true}'"
