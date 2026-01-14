# Documentation Index - DataFriday API

**Dernière mise à jour:** 14 Janvier 2026

## 📖 Table des Matières

### Core Documentation
- [README](./README.md) - Documentation principale
- [API Reference](./API_REFERENCE.md) - Référence API complète
- [API Architecture](./API_ARCHITECTURE.md) - Architecture détaillée
- [API Migration v1](./API_MIGRATION_V1.md) - Guide migration
- [Analyse Projet](./ANALYSE_PROJET.md) - Analyse complète du projet
- [Résumé Exécutif](./RESUME_EXECUTIF.md) - Vue d'ensemble

### Setup & Configuration
- [Setup Guide](./SETUP.md) - Installation
- [Environments](./ENVIRONMENTS.md) - Configuration environnements
- [Development](./DEVELOPMENT.md) - Guide développement
- [Database](./DATABASE.md) - Base de données
- [Supabase](./SUPABASE.md) - Configuration Supabase

### Authentication
- [Auth Testing Guide](./AUTH_TESTING_GUIDE.md) - Guide complet
- [Auth Quickstart](./AUTH_QUICKSTART.md) - Démarrage rapide
- [auth/](./auth/) - Documentation détaillée

### Weezevent Integration
- [Weezevent Index](./WEEZEVENT_INDEX.md) - Index général
- [Weezevent Architecture](./WEEZEVENT_ARCHITECTURE.md) - Architecture
- [Weezevent Integration](./WEEZEVENT_INTEGRATION.md) - Guide intégration
- [Credentials Usage](./WEEZEVENT_CREDENTIALS_USAGE.md) - Stockage credentials
- [API Client Usage](./WEEZEVENT_API_CLIENT_USAGE.md) - Client API
- [Sync User Guide](./WEEZEVENT_SYNC_USER_GUIDE.md) - Synchronisation
- [Webhook Setup](./WEEZEVENT_WEBHOOK_SETUP.md) - Configuration webhooks
- [Webhook Quickstart](./WEEZEVENT_WEBHOOK_QUICKSTART.md) - Webhooks rapide
- [Analytics Guide](./WEEZEVENT_ANALYTICS_GUIDE.md) - Analytics
- [Performance Guide](./WEEZEVENT_PERFORMANCE_GUIDE.md) - Optimisations
- [Data Mapping](./WEEZEVENT_DATA_MAPPING.md) - Mapping données
- [Testing Guide](./WEEZEVENT_TESTING_GUIDE.md) - Tests
- [weezevent/](./weezevent/) - Documentation détaillée Weezevent

### Reports & Tests
- [reports/](./reports/) - Rapports de tests et résultats

---

## 🎯 Par Module

### OnboardingModule
**Endpoints:** `POST /api/v1/onboarding`

**Documentation:**
- [Auth Testing Guide](./AUTH_TESTING_GUIDE.md)
- [Auth Quickstart](./AUTH_QUICKSTART.md)

### OrganizationsModule
**Endpoints:** `/api/v1/organizations/*`

**Documentation:**
- [API Reference](./API_REFERENCE.md#organizations)
- [API Architecture](./API_ARCHITECTURE.md#organizationsmodule)

### IntegrationsModule
**Endpoints:** `/api/v1/organizations/:id/integrations/*`

**Documentation:**
- [API Reference](./API_REFERENCE.md#integrations)
- [Weezevent Credentials](./WEEZEVENT_CREDENTIALS_USAGE.md)
- [Webhook Setup](./WEEZEVENT_WEBHOOK_SETUP.md)

### WeezeventModule
**Endpoints:** `/api/v1/weezevent/*`, `/api/v1/webhooks/weezevent/*`

**Documentation:**
- [Weezevent Index](./WEEZEVENT_INDEX.md)
- [Weezevent Architecture](./WEEZEVENT_ARCHITECTURE.md)
- [Sync Guide](./WEEZEVENT_SYNC_USER_GUIDE.md)
- [Analytics Guide](./WEEZEVENT_ANALYTICS_GUIDE.md)

---

## 🔍 Par Cas d'Usage

### Setup Initial
1. [Setup Guide](./SETUP.md)
2. [Environments](./ENVIRONMENTS.md)
3. [Supabase](./SUPABASE.md)

### Authentification
1. [Auth Quickstart](./AUTH_QUICKSTART.md)
2. [Auth Testing Guide](./AUTH_TESTING_GUIDE.md)

### Intégration Weezevent
1. [Weezevent Index](./WEEZEVENT_INDEX.md)
2. [Credentials Usage](./WEEZEVENT_CREDENTIALS_USAGE.md)
3. [Sync User Guide](./WEEZEVENT_SYNC_USER_GUIDE.md)
4. [Webhook Setup](./WEEZEVENT_WEBHOOK_SETUP.md)

### Analytics
1. [Analytics Guide](./WEEZEVENT_ANALYTICS_GUIDE.md)
2. [Performance Guide](./WEEZEVENT_PERFORMANCE_GUIDE.md)

### Development
1. [Development Guide](./DEVELOPMENT.md)
2. [API Architecture](./API_ARCHITECTURE.md)
3. [Database](./DATABASE.md)

---

## 📊 Diagrammes & Architecture

- [API Architecture](./API_ARCHITECTURE.md) - Architecture complète
- [Weezevent Architecture](./WEEZEVENT_ARCHITECTURE.md) - Architecture Weezevent
- [Architecture](./ARCHITECTURE.md) - Architecture générale

---

## 🆕 Dernières Mises à Jour

### Novembre 2024
- ✅ API v1 avec versioning
- ✅ OrganizationsModule
- ✅ IntegrationsModule
- ✅ Weezevent webhooks
- ✅ Performance optimizations
- ✅ Analytics guide

---

**Index mis à jour: Novembre 2024**
