# Guide de Test - Weezevent API Client

## 🧪 Tests Disponibles

### Tests Unitaires
- `WeezeventAuthService` - Authentification OAuth 2.0
- `WeezeventApiService` - Client HTTP avec retry
- `WeezeventClientService` - Méthodes haut niveau

### Tests d'Intégration
- Communication avec l'API Weezevent (mockée)
- Flux complet d'authentification et requêtes

## 🚀 Lancer les Tests

### Tous les tests
```bash
# Dans le conteneur Docker
make test

# Ou directement
docker exec datafriday-api-dev npm test
```

### Tests Weezevent uniquement
```bash
# Tests unitaires Weezevent
docker exec datafriday-api-dev npm test -- weezevent

# Avec coverage
docker exec datafriday-api-dev npm test -- weezevent --coverage
```

### Tests spécifiques
```bash
# AuthService uniquement
docker exec datafriday-api-dev npm test -- weezevent-auth.service

# ApiService uniquement
docker exec datafriday-api-dev npm test -- weezevent-api.service

# ClientService uniquement
docker exec datafriday-api-dev npm test -- weezevent-client.service
```

### Mode watch (développement)
```bash
docker exec -it datafriday-api-dev npm test -- --watch weezevent
```

## 🔍 Tests Manuels avec l'API Réelle

### Prérequis
1. Credentials Weezevent configurés pour un tenant
2. Organization ID Weezevent
3. Tenant ID dans votre système

### Test 1: Vérifier l'Authentification

```typescript
// Dans n'importe quel service ou controller
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';

// Tester l'authentification
const events = await this.weezeventClient.getEvents(
  'YOUR_TENANT_ID',
  'YOUR_ORGANIZATION_ID',
  { page: 1, perPage: 5 }
);

console.log('Events récupérés:', events.data.length);
console.log('Total:', events.meta.total);
```

### Test 2: Récupérer des Transactions

```typescript
const transactions = await this.weezeventClient.getTransactions(
  'YOUR_TENANT_ID',
  'YOUR_ORGANIZATION_ID',
  {
    page: 1,
    perPage: 10,
    status: 'V', // Validated
  }
);

console.log('Transactions:', transactions.data);
```

### Test 3: Informations Client

```typescript
// Récupérer un wallet
const wallet = await this.weezeventClient.getWallet(
  'YOUR_TENANT_ID',
  'YOUR_ORGANIZATION_ID',
  'WALLET_ID'
);

console.log('Wallet balance:', wallet.balance);

// Récupérer l'utilisateur
const user = await this.weezeventClient.getUser(
  'YOUR_TENANT_ID',
  'YOUR_ORGANIZATION_ID',
  wallet.user_id.toString()
);

console.log('Client:', user.first_name, user.last_name);
```

## 🧪 Tests avec Postman/Insomnia

### Configuration

**Base URL:** `http://localhost:3000`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Endpoints à Tester

#### 1. Configurer Weezevent

```http
PATCH /onboarding/tenants/:tenantId/weezevent

Body:
{
  "weezeventClientId": "app_eat-is-family-datafriday_...",
  "weezeventClientSecret": "vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF",
  "weezeventEnabled": true
}
```

#### 2. Récupérer la Config

```http
GET /onboarding/tenants/:tenantId/weezevent
```

Réponse attendue:
```json
{
  "clientId": "app_eat-is-family-datafriday_...",
  "enabled": true,
  "configured": true
}
```

## 📊 Coverage Attendu

### Objectifs
- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

### Vérifier le Coverage

```bash
# Générer le rapport
docker exec datafriday-api-dev npm test -- weezevent --coverage

# Voir le rapport HTML
open coverage/lcov-report/index.html
```

## 🐛 Debugging

### Activer les Logs Debug

Dans `envFiles/.env.development`:
```bash
LOG_LEVEL=debug
```

Redémarrer:
```bash
make dev-down && make dev-up
```

### Voir les Logs en Temps Réel

```bash
# Tous les logs
make dev-logs

# Filtrer Weezevent
docker logs -f datafriday-api-dev | grep -i weezevent
```

## ✅ Checklist de Test

### Tests Unitaires
- [ ] WeezeventAuthService
  - [ ] Token caching fonctionne
  - [ ] Refresh automatique
  - [ ] Gestion erreurs auth
- [ ] WeezeventApiService
  - [ ] Retry sur 5xx
  - [ ] Pas de retry sur 4xx
  - [ ] Exponential backoff
  - [ ] Error mapping
- [ ] WeezeventClientService
  - [ ] Toutes les méthodes
  - [ ] Pagination
  - [ ] Filtres

### Tests d'Intégration
- [ ] Authentification complète
- [ ] Récupération transactions
- [ ] Récupération wallets
- [ ] Récupération users
- [ ] Gestion erreurs réseau

### Tests Manuels
- [ ] Configuration credentials via API
- [ ] Récupération config
- [ ] Appel API Weezevent réel
- [ ] Vérification logs

## 🔧 Troubleshooting

### Erreur: "Cannot find module '@nestjs/axios'"

Les dépendances ne sont pas installées dans le conteneur:
```bash
docker exec datafriday-api-dev npm install @nestjs/axios axios
make dev-down && make dev-up
```

### Erreur: "Weezevent not configured"

Configurez d'abord les credentials:
```bash
curl -X PATCH http://localhost:3000/onboarding/tenants/TENANT_ID/weezevent \
  -H "Authorization: Bearer JWT" \
  -H "Content-Type: application/json" \
  -d '{"weezeventClientId":"...","weezeventClientSecret":"...","weezeventEnabled":true}'
```

### Erreur: "Authentication failed"

Vérifiez:
1. Client ID et Secret corrects
2. ENCRYPTION_KEY configurée
3. Credentials non expirés

## 📚 Ressources

- [Tests NestJS](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [API Weezevent](https://developers.weezevent.com/)
