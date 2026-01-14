# 🧪 Quick Test Guide - Weezevent API Client

## Lancer les Tests

### Option 1: Tous les tests Weezevent
```bash
docker exec datafriday-api-dev npm test -- weezevent
```

### Option 2: Tests avec coverage
```bash
docker exec datafriday-api-dev npm test -- weezevent --coverage
```

### Option 3: Tests spécifiques
```bash
# AuthService uniquement
docker exec datafriday-api-dev npm test -- weezevent-auth.service

# ApiService uniquement  
docker exec datafriday-api-dev npm test -- weezevent-api.service

# ClientService uniquement
docker exec datafriday-api-dev npm test -- weezevent-client.service
```

## Tests Créés

### ✅ WeezeventAuthService (weezevent-auth.service.spec.ts)
- Token caching et refresh
- Gestion des erreurs d'authentification
- Configuration invalide/désactivée

### ✅ WeezeventApiService (weezevent-api.service.spec.ts)
- Retry logic avec exponential backoff
- Error mapping (4xx, 5xx, network)
- Tous les HTTP methods (GET, POST, PUT, DELETE)

### ✅ WeezeventClientService (weezevent-client.service.spec.ts)
- Toutes les méthodes d'endpoint
- Gestion de la pagination
- Filtres et paramètres

## Test Manuel Rapide

### 1. Configurer les Credentials

```bash
curl -X PATCH http://localhost:3000/onboarding/tenants/TENANT_ID/weezevent \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weezeventClientId": "YOUR_CLIENT_ID",
    "weezeventClientSecret": "YOUR_CLIENT_SECRET",
    "weezeventEnabled": true
  }'
```

### 2. Vérifier la Config

```bash
curl http://localhost:3000/onboarding/tenants/TENANT_ID/weezevent \
  -H "Authorization: Bearer JWT_TOKEN"
```

### 3. Tester dans le Code

```typescript
// Dans n'importe quel service
const events = await this.weezeventClient.getEvents(
  tenantId,
  organizationId,
  { page: 1, perPage: 5 }
);
console.log('Events:', events.data);
```

## Résultats Attendus

✅ Tous les tests passent  
✅ Coverage > 80%  
✅ Aucune erreur de compilation  

## Troubleshooting

### Erreur: Cannot find module '@nestjs/axios'
```bash
docker exec datafriday-api-dev npm install @nestjs/axios axios
make dev-down && make dev-up
```

### Tests ne passent pas
```bash
# Voir les logs détaillés
docker exec datafriday-api-dev npm test -- weezevent --verbose
```

## Documentation Complète

Voir [WEEZEVENT_TESTING_GUIDE.md](./WEEZEVENT_TESTING_GUIDE.md) pour plus de détails.
