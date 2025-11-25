# API Versioning Strategy

## 🎯 Stratégie de Versioning

DataFriday API utilise le **versioning par URL** pour gérer les différentes versions de l'API.

---

## 📐 Structure

### Format
```
/api/{version}/{resource}
```

### Exemples
```
/api/v1/onboarding
/api/v1/organizations/:id
/api/v1/weezevent/transactions
```

---

## 🔧 Implémentation

### RouterModule (NestJS)

```typescript
RouterModule.register([
  {
    path: 'v1',
    children: [
      { path: 'onboarding', module: OnboardingModule },
      { path: 'organizations', module: OrganizationsModule },
      { path: 'weezevent', module: WeezeventModule },
    ],
  },
  // Future v2
  {
    path: 'v2',
    children: [
      { path: 'organizations', module: OrganizationsModuleV2 },
    ],
  },
])
```

---

## 📅 Versions

### v1 (Current)
**Status:** ✅ Production  
**Release:** Novembre 2024

**Endpoints:**
- `/api/v1/onboarding`
- `/api/v1/organizations/*`
- `/api/v1/integrations/*`
- `/api/v1/weezevent/*`
- `/api/v1/webhooks/*`

**Features:**
- Multi-tenant architecture
- Supabase authentication
- Weezevent integration
- Webhooks support
- Analytics

---

## 🔄 Migration Strategy

### Breaking Changes

Lorsqu'un breaking change est nécessaire:

1. **Créer nouvelle version** (v2)
2. **Maintenir v1** pendant période de transition
3. **Communiquer dépréciation** avec dates
4. **Fournir guide migration**

### Non-Breaking Changes

Peuvent être ajoutés à la version actuelle:
- Nouveaux endpoints
- Nouveaux champs optionnels
- Nouvelles features opt-in

---

## 📋 Deprecation Policy

### Timeline

```
Annonce → 6 mois → Dépréciation → 6 mois → Suppression
```

### Communication

**Headers de dépréciation:**
```
Deprecation: true
Sunset: Sat, 31 Dec 2025 23:59:59 GMT
Link: </api/v2/organizations>; rel="successor-version"
```

**Response:**
```json
{
  "data": {...},
  "meta": {
    "deprecated": true,
    "sunset": "2025-12-31",
    "successor": "/api/v2/organizations"
  }
}
```

---

## 🎯 Version Support

| Version | Status | Support Until | Notes |
|---------|--------|---------------|-------|
| v1 | ✅ Active | TBD | Current version |
| v2 | 🔮 Planned | - | Future |

---

## 📖 Best Practices

### Pour les Développeurs

**1. Toujours spécifier la version:**
```typescript
const API_BASE = 'https://api.datafriday.com/api/v1';
```

**2. Gérer les versions dans le code:**
```typescript
const apiClient = new ApiClient({ version: 'v1' });
```

**3. Surveiller les headers de dépréciation:**
```typescript
if (response.headers.get('Deprecation')) {
  console.warn('API deprecated:', response.headers.get('Sunset'));
}
```

### Pour l'API

**1. Backward compatibility dans la même version**

**2. Documentation claire des breaking changes**

**3. Tests de non-régression**

---

## 🚀 Roadmap

### v1.x (Current)
- ✅ Core features
- ✅ Weezevent integration
- ✅ Webhooks
- 🔄 Additional integrations

### v2.0 (Future)
- GraphQL support
- Real-time subscriptions
- Advanced filtering
- Batch operations

---

## 📚 Resources

- [API Reference](./API_REFERENCE.md) - v1 endpoints
- [API Migration](./API_MIGRATION_V1.md) - Migration guide
- [API Architecture](./API_ARCHITECTURE.md) - Architecture

---

**Version actuelle: v1**  
**Dernière mise à jour: Novembre 2024**
