# Guide Utilisateur - Synchronisation Weezevent

## 🎯 Introduction

Ce guide explique comment configurer et utiliser la synchronisation des données Weezevent dans DataFriday.

---

## 📋 Prérequis

### 1. Credentials Weezevent

Vous devez avoir :
- **Client ID** Weezevent (format: `app_xxx_xxx`)
- **Client Secret** Weezevent
- **Organization ID** Weezevent

### 2. Accès API

- Compte administrateur DataFriday
- Token JWT valide

---

## ⚙️ Configuration

### Étape 1: Configurer les Credentials

**Endpoint:** `PATCH /onboarding/tenants/:tenantId/weezevent`

```bash
curl -X PATCH https://api.datafriday.com/onboarding/tenants/VOTRE_TENANT_ID/weezevent \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weezeventClientId": "app_eat-is-family-datafriday_xxx",
    "weezeventClientSecret": "votre_secret_ici",
    "weezeventEnabled": true
  }'
```

**Réponse:**
```json
{
  "clientId": "app_eat-is-family-datafriday_xxx",
  "enabled": true,
  "configured": true
}
```

### Étape 2: Vérifier la Configuration

```bash
curl https://api.datafriday.com/onboarding/tenants/VOTRE_TENANT_ID/weezevent \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

---

## 🔄 Synchronisation

### Synchronisation Manuelle

#### Synchroniser les Transactions

```bash
curl -X POST https://api.datafriday.com/weezevent/sync \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "transactions",
    "fromDate": "2024-01-01",
    "toDate": "2024-12-31",
    "full": false
  }'
```

**Paramètres:**
- `type`: Type de données (`transactions`, `events`, `products`, `wallets`, `users`)
- `fromDate`: Date de début (optionnel, format ISO 8601)
- `toDate`: Date de fin (optionnel)
- `full`: Synchronisation complète (`true`) ou incrémentale (`false`)

**Réponse:**
```json
{
  "type": "transactions",
  "success": true,
  "itemsSynced": 150,
  "itemsCreated": 100,
  "itemsUpdated": 50,
  "errors": 0,
  "duration": 5432,
  "fromDate": "2024-01-01T00:00:00.000Z",
  "toDate": "2024-12-31T23:59:59.999Z"
}
```

#### Synchroniser les Événements

```bash
curl -X POST https://api.datafriday.com/weezevent/sync \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "events"
  }'
```

#### Synchroniser les Produits

```bash
curl -X POST https://api.datafriday.com/weezevent/sync \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "products"
  }'
```

---

## 📊 Consultation des Données

### Liste des Transactions

```bash
curl "https://api.datafriday.com/weezevent/transactions?page=1&perPage=50&status=V" \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

**Paramètres de filtrage:**
- `page`: Numéro de page (défaut: 1)
- `perPage`: Nombre par page (défaut: 50, max: 100)
- `status`: Statut (`W`=En attente, `V`=Validée, `C`=Annulée, `R`=Remboursée)
- `fromDate`: Date de début
- `toDate`: Date de fin
- `eventId`: ID de l'événement
- `merchantId`: ID du marchand

**Réponse:**
```json
{
  "data": [
    {
      "id": "trans-123",
      "weezeventId": "789",
      "amount": 5000,
      "status": "V",
      "transactionDate": "2024-01-15T10:30:00.000Z",
      "eventName": "Music Festival",
      "merchantName": "Burger Stand",
      "items": [
        {
          "id": "item-1",
          "productName": "Burger Deluxe",
          "quantity": 1,
          "unitPrice": 1200,
          "payments": [...]
        }
      ]
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 150,
    "total_pages": 3
  }
}
```

### Détail d'une Transaction

```bash
curl https://api.datafriday.com/weezevent/transactions/trans-123 \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

### Liste des Événements

```bash
curl "https://api.datafriday.com/weezevent/events?page=1&perPage=20" \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

### Liste des Produits

```bash
curl "https://api.datafriday.com/weezevent/products?page=1&perPage=50&category=food" \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

### Statut de Synchronisation

```bash
curl https://api.datafriday.com/weezevent/sync/status \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

**Réponse:**
```json
{
  "lastSync": {
    "transactions": "2024-11-25T10:00:00.000Z",
    "events": "2024-11-24T15:00:00.000Z",
    "products": "2024-11-23T12:00:00.000Z"
  },
  "counts": {
    "transactions": 1523,
    "events": 12,
    "products": 245
  },
  "isRunning": false
}
```

---

## 💡 Bonnes Pratiques

### Synchronisation Incrémentale

**Recommandé** pour les syncs régulières :

```json
{
  "type": "transactions",
  "fromDate": "2024-11-01",
  "full": false
}
```

### Synchronisation Complète

**Utilisé** uniquement pour :
- Première synchronisation
- Reset des données
- Correction d'incohérences

```json
{
  "type": "transactions",
  "full": true
}
```

### Fréquence Recommandée

- **Transactions**: Toutes les 15-30 minutes
- **Événements**: 1 fois par jour
- **Produits**: 1 fois par jour

---

## 🔍 Cas d'Usage

### Cas 1: Première Synchronisation

```bash
# 1. Configurer les credentials
curl -X PATCH .../weezevent -d '{"weezeventClientId":"...","weezeventClientSecret":"...","weezeventEnabled":true}'

# 2. Synchroniser les événements
curl -X POST .../sync -d '{"type":"events"}'

# 3. Synchroniser les produits
curl -X POST .../sync -d '{"type":"products"}'

# 4. Synchroniser les transactions (full)
curl -X POST .../sync -d '{"type":"transactions","full":true}'
```

### Cas 2: Synchronisation Quotidienne

```bash
# Synchroniser les transactions du jour
curl -X POST .../sync -d '{
  "type":"transactions",
  "fromDate":"2024-11-25",
  "full":false
}'
```

### Cas 3: Analyse d'un Événement Spécifique

```bash
# 1. Récupérer l'ID de l'événement
curl .../events

# 2. Filtrer les transactions par événement
curl ".../transactions?eventId=123&page=1&perPage=100"
```

---

## ⚠️ Dépannage

### Erreur: "Weezevent not configured"

**Solution:** Vérifiez que les credentials sont configurés :
```bash
curl .../tenants/TENANT_ID/weezevent
```

### Erreur: "Authentication failed"

**Causes possibles:**
- Client ID ou Secret incorrect
- Credentials expirés
- ENCRYPTION_KEY manquante

**Solution:** Reconfigurez les credentials.

### Synchronisation Lente

**Optimisations:**
- Utilisez la pagination (max 100 items)
- Sync incrémentale avec `fromDate`
- Évitez les syncs complètes fréquentes

### Données Manquantes

**Solution:** Lancez une sync complète :
```bash
curl -X POST .../sync -d '{"type":"transactions","full":true}'
```

---

## 📞 Support

Pour toute question ou problème :
- Documentation technique: `/docs/WEEZEVENT_INDEX.md`
- Support: support@datafriday.com

---

## 🔐 Sécurité

- Les credentials sont chiffrés (AES-256-GCM)
- Communication HTTPS uniquement
- Tokens JWT avec expiration
- Isolation multi-tenant

---

## 📈 Limites

- **Pagination**: Max 100 items par page
- **Rate limiting**: Respecter les limites Weezevent
- **Timeout**: 10 secondes par requête
- **Retry**: 3 tentatives maximum
