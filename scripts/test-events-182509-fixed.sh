#!/bin/bash

# Test pour récupérer les événements avec organization ID 182509
# Version corrigée utilisant Supabase pour l'authentification

set -e

# Charger les variables d'environnement
ENV_FILE="envFiles/.env.development"
if [ -f "$ENV_FILE" ]; then
  echo "📂 Chargement des variables depuis $ENV_FILE..."
  export $(grep -E "^(SUPABASE_URL|SUPABASE_ANON_KEY|WEEZEVENT_CLIENT_ID|WEEZEVENT_CLIENT_SECRET)=" "$ENV_FILE" | xargs)
fi

# Vérifier que les variables Supabase sont chargées
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ Variables Supabase manquantes (SUPABASE_URL, SUPABASE_ANON_KEY)"
  exit 1
fi

API_URL="http://localhost:3000/api/v1"
EMAIL="kouameulrichk@gmail.com"
PASSWORD="SecurePassword123!"

echo ""
echo "🔐 Connexion à Supabase..."
# Authentification via Supabase
SUPABASE_AUTH_URL="${SUPABASE_URL}/auth/v1/token?grant_type=password"
AUTH_RESPONSE=$(curl -s -X POST "$SUPABASE_AUTH_URL" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

JWT_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.access_token')
USER_ID=$(echo $AUTH_RESPONSE | jq -r '.user.id')

if [ "$JWT_TOKEN" = "null" ] || [ -z "$JWT_TOKEN" ]; then
  echo "❌ Échec de connexion Supabase"
  echo "$AUTH_RESPONSE" | jq
  exit 1
fi

echo "✅ Connecté à Supabase (User ID: $USER_ID)"

echo ""
echo "📋 Récupération de l'organisation..."
ME_RESPONSE=$(curl -s -X GET "$API_URL/me" \
  -H "Authorization: Bearer $JWT_TOKEN")

TENANT_ID=$(echo $ME_RESPONSE | jq -r '.tenant.id')

if [ "$TENANT_ID" = "null" ] || [ -z "$TENANT_ID" ]; then
  echo "❌ Impossible de récupérer l'organisation"
  echo "$ME_RESPONSE" | jq
  exit 1
fi

echo "✅ Tenant ID: $TENANT_ID"

echo ""
echo "📝 Configuration Weezevent avec organization ID: 182509"
WZ_CONFIG=$(curl -s -X PATCH "$API_URL/organizations/$TENANT_ID/integrations/weezevent" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventClientId\": \"$WEEZEVENT_CLIENT_ID\",
    \"weezeventClientSecret\": \"$WEEZEVENT_CLIENT_SECRET\",
    \"weezeventOrganizationId\": \"182509\",
    \"weezeventEnabled\": true
  }")

WZ_ENABLED=$(echo $WZ_CONFIG | jq -r '.weezeventEnabled')
if [ "$WZ_ENABLED" = "true" ]; then
  echo "✅ Weezevent configuré"
else
  echo "❌ Échec configuration"
  echo "$WZ_CONFIG" | jq
fi

echo ""
echo "🔄 Synchronisation des événements depuis Weezevent..."
SYNC_RESULT=$(curl -s -X POST "$API_URL/weezevent/sync" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "events"}')

SYNC_SUCCESS=$(echo $SYNC_RESULT | jq -r '.success')
if [ "$SYNC_SUCCESS" = "true" ]; then
  SYNCED_COUNT=$(echo $SYNC_RESULT | jq -r '.events.synced // 0')
  echo "✅ Synchronisation réussie - $SYNCED_COUNT événements synchronisés"
else
  echo "⚠️  Synchronisation échouée ou partielle"
  echo "$SYNC_RESULT" | jq .
fi

echo ""
echo "📋 Récupération des événements depuis la base de données..."
EVENTS=$(curl -s -X GET "$API_URL/weezevent/events" \
  -H "Authorization: Bearer $JWT_TOKEN")

# Check if response has data field (paginated response)
HAS_DATA=$(echo "$EVENTS" | jq 'has("data")' -r)

if [ "$HAS_DATA" = "true" ]; then
  EVENT_COUNT=$(echo "$EVENTS" | jq '.meta.total')
  echo "✅ Nombre total d'événements: $EVENT_COUNT"

  if [ "$EVENT_COUNT" -gt 0 ]; then
    echo ""
    echo "📌 Liste des événements:"
    echo "$EVENTS" | jq -r '.data[] | "  - \(.name) (ID: \(.weezeventId), Date: \(.startDate))"'
    echo ""
    echo "📄 Premier événement (structure complète):"
    echo "$EVENTS" | jq '.data[0]'
  else
    echo "⚠️  Aucun événement dans la base de données"
  fi
else
  echo "📄 Réponse brute:"
  echo "$EVENTS" | jq .
fi
