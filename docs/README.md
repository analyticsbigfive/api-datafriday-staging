# DataFriday API Documentation

## 🚀 Quick Start

1. [Setup Guide](./SETUP.md) - Installation et configuration
2. [Auth Testing](./AUTH_TESTING_GUIDE.md) - Tester l'authentification
3. [API Reference](./API_REFERENCE.md) - Tous les endpoints

---

## 📚 Documentation Principale

### Architecture & Design
- **[API_ARCHITECTURE.md](./API_ARCHITECTURE.md)** - Architecture complète
- **[API_REFERENCE.md](./API_REFERENCE.md)** - Référence API v1
- **[API_MIGRATION_V1.md](./API_MIGRATION_V1.md)** - Guide migration v1
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture générale

### Authentication
- **[AUTH_TESTING_GUIDE.md](./AUTH_TESTING_GUIDE.md)** - Guide de test complet
- **[AUTH_QUICKSTART.md](./AUTH_QUICKSTART.md)** - Démarrage rapide
- **[auth/](./auth/)** - Documentation auth détaillée

### Development
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Guide développement
- **[ENVIRONMENTS.md](./ENVIRONMENTS.md)** - Configuration environnements
- **[DATABASE.md](./DATABASE.md)** - Base de données
- **[SUPABASE.md](./SUPABASE.md)** - Configuration Supabase

---

## 🎯 Intégration Weezevent

### Documentation Complète
- **[WEEZEVENT_INDEX.md](./WEEZEVENT_INDEX.md)** - Index général
- **[WEEZEVENT_ARCHITECTURE.md](./WEEZEVENT_ARCHITECTURE.md)** - Architecture
- **[WEEZEVENT_INTEGRATION.md](./WEEZEVENT_INTEGRATION.md)** - Guide intégration

### Guides Utilisateur
- **[WEEZEVENT_CREDENTIALS_USAGE.md](./WEEZEVENT_CREDENTIALS_USAGE.md)** - Stockage credentials
- **[WEEZEVENT_API_CLIENT_USAGE.md](./WEEZEVENT_API_CLIENT_USAGE.md)** - Client API
- **[WEEZEVENT_SYNC_USER_GUIDE.md](./WEEZEVENT_SYNC_USER_GUIDE.md)** - Synchronisation
- **[WEEZEVENT_WEBHOOK_SETUP.md](./WEEZEVENT_WEBHOOK_SETUP.md)** - Configuration webhooks
- **[WEEZEVENT_WEBHOOK_QUICKSTART.md](./WEEZEVENT_WEBHOOK_QUICKSTART.md)** - Webhooks rapide

### Analytics & Performance
- **[WEEZEVENT_ANALYTICS_GUIDE.md](./WEEZEVENT_ANALYTICS_GUIDE.md)** - Guide analytics
- **[WEEZEVENT_PERFORMANCE_GUIDE.md](./WEEZEVENT_PERFORMANCE_GUIDE.md)** - Optimisations

### Technique
- **[WEEZEVENT_DATA_MAPPING.md](./WEEZEVENT_DATA_MAPPING.md)** - Mapping données
- **[WEEZEVENT_TESTING_GUIDE.md](./WEEZEVENT_TESTING_GUIDE.md)** - Tests

---

## 🔑 Endpoints Principaux

### Onboarding
```
POST /api/v1/onboarding
```

### Organizations
```
GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id
DELETE /api/v1/organizations/:id
```

### Integrations
```
GET   /api/v1/organizations/:id/integrations
PATCH /api/v1/organizations/:id/integrations/weezevent
GET   /api/v1/organizations/:id/integrations/weezevent
PATCH /api/v1/organizations/:id/integrations/webhooks
GET   /api/v1/organizations/:id/integrations/webhooks
```

### Weezevent
```
GET  /api/v1/weezevent/transactions
POST /api/v1/weezevent/sync
GET  /api/v1/weezevent/events
```

### Webhooks
```
POST /api/v1/webhooks/weezevent/:tenantId
```

---

## 🛠️ Commandes Utiles

```bash
# Development
make dev-up              # Démarrer
make dev-down            # Arrêter
make dev-logs            # Voir logs
make dev-studio          # Prisma Studio

# Database
make dev-migrate         # Créer migration
make prisma-generate     # Générer client

# Tests
./scripts/test-auth-quick.sh  # Test auth rapide
```

---

## 📖 Par Cas d'Usage

### Je veux...

**...configurer l'authentification**
→ [AUTH_TESTING_GUIDE.md](./AUTH_TESTING_GUIDE.md)

**...intégrer Weezevent**
→ [WEEZEVENT_INDEX.md](./WEEZEVENT_INDEX.md)

**...configurer les webhooks**
→ [WEEZEVENT_WEBHOOK_SETUP.md](./WEEZEVENT_WEBHOOK_SETUP.md)

**...créer des analytics**
→ [WEEZEVENT_ANALYTICS_GUIDE.md](./WEEZEVENT_ANALYTICS_GUIDE.md)

**...optimiser les performances**
→ [WEEZEVENT_PERFORMANCE_GUIDE.md](./WEEZEVENT_PERFORMANCE_GUIDE.md)

**...comprendre l'architecture**
→ [API_ARCHITECTURE.md](./API_ARCHITECTURE.md)

---

## 🆕 Nouveautés

### v1.0 (Novembre 2024)
- ✅ API versioning (v1)
- ✅ OrganizationsModule
- ✅ IntegrationsModule
- ✅ Weezevent webhooks
- ✅ Performance optimizations
- ✅ Analytics guide

---

## 🤝 Support

Pour toute question, consultez d'abord:
1. [API_REFERENCE.md](./API_REFERENCE.md) - Référence complète
2. [WEEZEVENT_INDEX.md](./WEEZEVENT_INDEX.md) - Documentation Weezevent
3. [AUTH_TESTING_GUIDE.md](./AUTH_TESTING_GUIDE.md) - Guide auth

---

**Documentation mise à jour: Novembre 2024**
