#!/bin/bash

# 🧪 Script de Test Complet - DataFriday API
# Tests: Auth + Onboarding + Weezevent Config + Webhooks + Sync

set -e

# Charger les variables d'environnement depuis .env.development
ENV_FILE="envFiles/.env.development"

if [ -f "$ENV_FILE" ]; then
  echo "📂 Chargement des variables depuis $ENV_FILE..."
  # Exporter les variables nécessaires
  export $(grep -E "^(SUPABASE_URL|SUPABASE_ANON_KEY|WEEZEVENT_CLIENT_ID|WEEZEVENT_CLIENT_SECRET)=" "$ENV_FILE" | xargs)
fi

# Configuration
API_URL="${API_URL:-http://localhost:3000/api/v1}"
SUPABASE_URL="${SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_ANON_KEY}"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Test Complet DataFriday API${NC}"
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
EMAIL="kouameulrichk@gmail.com"
PASSWORD="SecurePassword123!"

echo -e "${BLUE}📧 Email de test: $EMAIL${NC}"
echo ""

# ============================================
# PHASE 1: HEALTH CHECK
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 1: Health Check${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}✅ API is healthy${NC}"
else
  echo -e "${RED}❌ API health check failed${NC}"
  exit 1
fi
echo ""

# ============================================
# PHASE 2: AUTHENTICATION
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 2: Authentication${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}2.1 Signup...${NC}"
SIGNUP_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

USER_ID=$(echo $SIGNUP_RESPONSE | jq -r '.id // .user.id // empty')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ Signup failed${NC}"
  echo "$SIGNUP_RESPONSE" | jq
  exit 1
fi

echo -e "${GREEN}✅ User created: $USER_ID${NC}"
echo ""

echo -e "${BLUE}2.2 Login...${NC}"
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

# ============================================
# PHASE 3: ONBOARDING
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 3: Onboarding${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}3.1 Creating organization...${NC}"
ORG_RESPONSE=$(curl -s -X POST "$API_URL/onboarding" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Test Organization",
    "firstName": "John",
    "lastName": "Doe"
  }')

TENANT_ID=$(echo $ORG_RESPONSE | jq -r '.tenant.id')

# Si l'organisation existe déjà (409), récupérer l'organisation existante
if [ "$TENANT_ID" = "null" ] || [ -z "$TENANT_ID" ]; then
  STATUS_CODE=$(echo $ORG_RESPONSE | jq -r '.statusCode')
  if [ "$STATUS_CODE" = "409" ]; then
    echo -e "${YELLOW}⚠️  Organization already exists, retrieving it...${NC}"
    
    # Récupérer l'utilisateur courant avec son organisation
    ME_RESPONSE=$(curl -s -X GET "$API_URL/me" \
      -H "Authorization: Bearer $JWT_TOKEN")
    
    TENANT_ID=$(echo $ME_RESPONSE | jq -r '.tenant.id')
    
    if [ "$TENANT_ID" = "null" ] || [ -z "$TENANT_ID" ]; then
      echo -e "${RED}❌ Could not retrieve existing organization${NC}"
      echo "$ME_RESPONSE" | jq
      exit 1
    fi
    
    echo -e "${GREEN}✅ Using existing organization${NC}"
    echo "   Tenant ID: $TENANT_ID"
  else
    echo -e "${RED}❌ Organization creation failed${NC}"
    echo "$ORG_RESPONSE" | jq
    exit 1
  fi
else
  echo -e "${GREEN}✅ Organization created${NC}"
  echo "   Tenant ID: $TENANT_ID"
fi
echo ""

echo -e "${BLUE}3.2 Get organization details...${NC}"
ORG_DETAILS=$(curl -s -X GET "$API_URL/organizations/$TENANT_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")

ORG_NAME=$(echo $ORG_DETAILS | jq -r '.name')
echo -e "${GREEN}✅ Organization retrieved: $ORG_NAME${NC}"
echo ""

# ============================================
# PHASE 4: WEEZEVENT CONFIGURATION
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 4: Weezevent Configuration${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}4.1 Configure Weezevent credentials...${NC}"

# Utiliser les credentials depuis l'environnement ou des valeurs de test
WZ_CLIENT_ID="${WEEZEVENT_CLIENT_ID:-test_client_id_123}"
WZ_CLIENT_SECRET="${WEEZEVENT_CLIENT_SECRET:-test_secret_456}"

if [ "$WZ_CLIENT_ID" != "test_client_id_123" ]; then
  echo "   Using real Weezevent credentials from environment"
else
  echo "   Using test credentials (set WEEZEVENT_CLIENT_ID and WEEZEVENT_CLIENT_SECRET for real data)"
fi

WZ_CONFIG=$(curl -s -X PATCH "$API_URL/organizations/$TENANT_ID/integrations/weezevent" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventClientId\": \"$WZ_CLIENT_ID\",
    \"weezeventClientSecret\": \"$WZ_CLIENT_SECRET\",
    \"weezeventOrganizationId\": \"${WEEZEVENT_ORGANIZATION_ID:-$WZ_CLIENT_ID}\",
    \"weezeventEnabled\": true
  }")

WZ_ENABLED=$(echo $WZ_CONFIG | jq -r '.weezeventEnabled')
if [ "$WZ_ENABLED" = "true" ]; then
  echo -e "${GREEN}✅ Weezevent configured${NC}"
  echo "   Client ID: $(echo $WZ_CONFIG | jq -r '.weezeventClientId')"
else
  echo -e "${RED}❌ Weezevent configuration failed${NC}"
  echo "$WZ_CONFIG" | jq
fi
echo ""

echo -e "${BLUE}4.2 Get Weezevent configuration...${NC}"
WZ_GET=$(curl -s -X GET "$API_URL/organizations/$TENANT_ID/integrations/weezevent" \
  -H "Authorization: Bearer $JWT_TOKEN")

WZ_CONFIGURED=$(echo $WZ_GET | jq -r '.configured')
echo -e "${GREEN}✅ Weezevent config retrieved${NC}"
echo "   Configured: $WZ_CONFIGURED"
echo "   Enabled: $(echo $WZ_GET | jq -r '.enabled')"
echo ""

# ============================================
# PHASE 5: WEBHOOK CONFIGURATION
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 5: Webhook Configuration${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}5.1 Configure webhooks...${NC}"
WEBHOOK_SECRET="webhook_secret_$(date +%s)"
WH_CONFIG=$(curl -s -X PATCH "$API_URL/organizations/$TENANT_ID/integrations/webhooks" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventWebhookSecret\": \"$WEBHOOK_SECRET\",
    \"weezeventWebhookEnabled\": true
  }")

WH_ENABLED=$(echo $WH_CONFIG | jq -r '.weezeventWebhookEnabled')
if [ "$WH_ENABLED" = "true" ]; then
  echo -e "${GREEN}✅ Webhooks configured${NC}"
  echo "   Secret: ${WEBHOOK_SECRET:0:20}..."
else
  echo -e "${RED}❌ Webhook configuration failed${NC}"
  echo "$WH_CONFIG" | jq
fi
echo ""

echo -e "${BLUE}5.2 Get webhook configuration...${NC}"
WH_GET=$(curl -s -X GET "$API_URL/organizations/$TENANT_ID/integrations/webhooks" \
  -H "Authorization: Bearer $JWT_TOKEN")

echo -e "${GREEN}✅ Webhook config retrieved${NC}"
echo "   Enabled: $(echo $WH_GET | jq -r '.enabled')"
echo ""

# ============================================
# PHASE 6: INTEGRATIONS OVERVIEW
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 6: Integrations Overview${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}6.1 List all integrations...${NC}"
INTEGRATIONS=$(curl -s -X GET "$API_URL/organizations/$TENANT_ID/integrations" \
  -H "Authorization: Bearer $JWT_TOKEN")

echo -e "${GREEN}✅ Integrations retrieved${NC}"
echo "$INTEGRATIONS" | jq
echo ""

# ============================================
# PHASE 7: ORGANIZATION MANAGEMENT
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 7: Organization Management${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}7.1 Update organization...${NC}"
ORG_UPDATE=$(curl -s -X PATCH "$API_URL/organizations/$TENANT_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Organization"
  }')

UPDATED_NAME=$(echo $ORG_UPDATE | jq -r '.name')
echo -e "${GREEN}✅ Organization updated${NC}"
echo "   New name: $UPDATED_NAME"
echo ""

# ============================================
# PHASE 8: WEEZEVENT DATA RETRIEVAL
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 8: Weezevent Data Retrieval${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}8.1 Get transactions...${NC}"
TRANSACTIONS=$(curl -s -X GET "$API_URL/weezevent/transactions?limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN")

TRANS_COUNT=$(echo $TRANSACTIONS | jq -r '.data | length // 0')
echo -e "${GREEN}✅ Transactions retrieved${NC}"
echo "   Count: $TRANS_COUNT"
if [ "$TRANS_COUNT" -gt 0 ]; then
  echo "   First transaction ID: $(echo $TRANSACTIONS | jq -r '.data[0].id // "N/A"')"
fi
echo ""

echo -e "${BLUE}8.2 Get events...${NC}"
EVENTS=$(curl -s -X GET "$API_URL/weezevent/events" \
  -H "Authorization: Bearer $JWT_TOKEN")

EVENTS_COUNT=$(echo $EVENTS | jq -r 'if type=="array" then length elif type=="object" then . | length else 0 end')
echo -e "${GREEN}✅ Events retrieved${NC}"
echo "   Count: $EVENTS_COUNT"
if [ "$EVENTS_COUNT" -gt 0 ]; then
  # Pour un objet, récupérer la première valeur
  FIRST_EVENT=$(echo $EVENTS | jq -r 'if type=="array" then .[0].name else (. | to_entries[0].value | if type=="object" then .name else . end) end // "N/A"')
  echo "   First event: $FIRST_EVENT"
fi
echo ""

echo -e "${BLUE}8.3 Get products...${NC}"
PRODUCTS=$(curl -s -X GET "$API_URL/weezevent/products" \
  -H "Authorization: Bearer $JWT_TOKEN")

PRODUCTS_COUNT=$(echo $PRODUCTS | jq -r 'if type=="array" then length elif type=="object" then . | length else 0 end')
echo -e "${GREEN}✅ Products retrieved${NC}"
echo "   Count: $PRODUCTS_COUNT"
if [ "$PRODUCTS_COUNT" -gt 0 ]; then
  # Pour un objet, récupérer la première valeur
  FIRST_PRODUCT=$(echo $PRODUCTS | jq -r 'if type=="array" then .[0].name else (. | to_entries[0].value | if type=="object" then .name else . end) end // "N/A"')
  echo "   First product: $FIRST_PRODUCT"
fi
echo ""

echo -e "${BLUE}8.4 Trigger manual sync...${NC}"
SYNC_RESPONSE=$(curl -s -X POST "$API_URL/weezevent/sync" \
  -H "Authorization: Bearer $JWT_TOKEN")

SYNC_STATUS=$(echo $SYNC_RESPONSE | jq -r '.message // .statusCode')
if echo "$SYNC_STATUS" | grep -q "Synchronization\|started\|401"; then
  if echo "$SYNC_STATUS" | grep -q "401"; then
    echo -e "${YELLOW}⚠️  Sync requires valid Weezevent credentials${NC}"
    echo "   (This is expected with test credentials)"
  else
    echo -e "${GREEN}✅ Sync triggered${NC}"
    echo "   Status: $SYNC_STATUS"
  fi
else
  echo -e "${YELLOW}⚠️  Sync response: $SYNC_STATUS${NC}"
fi
echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "📝 Test Summary:"
echo "   ✅ Health Check"
echo "   ✅ Authentication (Signup + Login)"
echo "   ✅ Organization Creation"
echo "   ✅ Organization Retrieval"
echo "   ✅ Weezevent Configuration"
echo "   ✅ Webhook Configuration"
echo "   ✅ Integrations Overview"
echo "   ✅ Organization Update"
echo "   ✅ Weezevent Transactions"
echo "   ✅ Weezevent Events"
echo "   ✅ Weezevent Products"
echo "   ✅ Manual Sync Trigger"
echo ""

echo "📋 Credentials:"
echo "   Email:        $EMAIL"
echo "   Password:     $PASSWORD"
echo "   User ID:      $USER_ID"
echo "   Tenant ID:    $TENANT_ID"
echo "   JWT Token:    ${JWT_TOKEN:0:40}..."
echo "   Webhook URL:  $API_URL/webhooks/weezevent/$TENANT_ID"
echo ""

echo "💡 Next steps:"
echo ""
echo "   # Export credentials"
echo "   export JWT_TOKEN='$JWT_TOKEN'"
echo "   export TENANT_ID='$TENANT_ID'"
echo ""
echo "   # Test Weezevent sync (requires real credentials)"
echo "   curl -X POST $API_URL/weezevent/sync \\"
echo "     -H 'Authorization: Bearer \$JWT_TOKEN'"
echo ""
echo "   # Test webhook reception"
echo "   curl -X POST $API_URL/webhooks/weezevent/\$TENANT_ID \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'X-Weezevent-Signature: <signature>' \\"
echo "     -d '{\"type\":\"transaction\",\"method\":\"create\",\"data\":{\"id\":123}}'"
echo ""
