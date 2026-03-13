#!/bin/bash

# Test de validation pour la création d'un espace avec department = 0
# Le backend devrait renvoyer une erreur de validation car department doit être entre 1 et 95

API_URL="http://localhost:3000/api/v1"

echo "🧪 Test de validation - Création d'espace avec department = 0"
echo "=============================================================="
echo ""

# Test 1: Sans authentification (devrait retourner 401)
echo "Test 1: Sans authentification"
echo "------------------------------"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$API_URL/spaces" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Space Test",
    "image": "",
    "spaceType": "Stadium",
    "spaceTypeOther": "",
    "maxCapacity": 100000,
    "department": 0,
    "homeTeam": "Metro",
    "addressLine1": "Marcory",
    "addressLine2": "",
    "city": "Lyon",
    "postcode": "0000",
    "country": "France",
    "tel": "",
    "email": "",
    "mainContactPerson": "",
    "contactEmail": "",
    "contactTel": "",
    "instagram": "",
    "tiktok": "",
    "facebook": "",
    "twitter": ""
}')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "Status Code: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Test 1 PASSED: Retourne bien 401 Unauthorized sans token"
else
  echo "❌ Test 1 FAILED: Devrait retourner 401, a retourné $HTTP_CODE"
fi

echo ""
echo "=============================================================="
echo ""
echo "📝 Note: Pour tester avec authentification, vous devez:"
echo "1. Créer un compte via Supabase"
echo "2. Obtenir un JWT token"
echo "3. Créer une organisation (onboarding)"
echo "4. Utiliser le token pour appeler l'endpoint"
echo ""
echo "Exemple avec token:"
echo "curl -X POST \"$API_URL/spaces\" \\"
echo "  -H \"Authorization: Bearer \$JWT_TOKEN\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"name\":\"Space Test\",\"department\":0,...}'"
echo ""
echo "L'erreur attendue avec un token valide devrait être:"
echo "{"
echo "  \"statusCode\": 400,"
echo "  \"message\": \"Validation failed\","
echo "  \"errors\": ["
echo "    {"
echo "      \"property\": \"department\","
echo "      \"constraints\": {"
echo "        \"min\": \"department must not be less than 1\""
echo "      },"
echo "      \"value\": 0"
echo "    }"
echo "  ]"
echo "}"
