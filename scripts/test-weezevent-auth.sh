#!/bin/bash

# Test direct Weezevent OAuth authentication

set -e

# Charger les variables d'environnement
ENV_FILE="envFiles/.env.development"
if [ -f "$ENV_FILE" ]; then
  echo "📂 Chargement des variables depuis $ENV_FILE..."
  export $(grep -E "^(WEEZEVENT_CLIENT_ID|WEEZEVENT_CLIENT_SECRET)=" "$ENV_FILE" | xargs)
fi

# Vérifier que les variables sont chargées
if [ -z "$WEEZEVENT_CLIENT_ID" ] || [ -z "$WEEZEVENT_CLIENT_SECRET" ]; then
  echo "❌ Variables Weezevent manquantes"
  exit 1
fi

echo "🔑 Client ID: ${WEEZEVENT_CLIENT_ID:0:20}..."
echo "🔒 Client Secret: ${WEEZEVENT_CLIENT_SECRET:0:20}..."

echo ""
echo "🔐 Test d'authentification OAuth Weezevent (Keycloak)..."

# Test avec l'URL OAuth correcte (Keycloak)
AUTH_URL="https://accounts.weezevent.com/realms/accounts/protocol/openid-connect/token"

echo "📍 URL: $AUTH_URL"
echo ""

# Créer Basic Auth header
CREDENTIALS=$(echo -n "$WEEZEVENT_CLIENT_ID:$WEEZEVENT_CLIENT_SECRET" | base64)
echo "🔑 Authorization: Basic ${CREDENTIALS:0:30}..."
echo ""

# Requête OAuth avec Basic Auth
RESPONSE=$(curl -v -X POST "$AUTH_URL" \
  -H "Authorization: Basic $CREDENTIALS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  2>&1)

echo "$RESPONSE"

# Extraire le token si succès
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
  echo ""
  echo "✅ Authentification réussie!"
  echo "🎫 Token: ${ACCESS_TOKEN:0:50}..."
  
  echo ""
  echo "🧪 Test d'appel API avec le token..."
  API_RESPONSE=$(curl -s -X GET "https://api.weezevent.com/pay/v1/organizations/182509/events" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Accept: application/json")
  
  echo "Réponse:"
  echo "$API_RESPONSE" | jq . || echo "$API_RESPONSE"
else
  echo ""
  echo "❌ Échec d'authentification"
fi
