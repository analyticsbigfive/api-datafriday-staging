# 🚀 Guide de Démarrage Rapide - Webhooks Weezevent

## En 5 Minutes

### 1️⃣ Générer un Secret (30 secondes)

```bash
openssl rand -hex 32
```

Copiez le résultat, par exemple: `a1b2c3d4e5f6...`

---

### 2️⃣ Configurer DataFriday (1 minute)

```bash
# Remplacez les valeurs
TENANT_ID="votre_tenant_id"
JWT_TOKEN="votre_jwt_token"
SECRET="le_secret_généré_étape_1"

# Configurer
curl -X PATCH https://api.datafriday.com/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventWebhookSecret\": \"$SECRET\",
    \"weezeventWebhookEnabled\": true
  }"
```

**Résultat attendu:**
```json
{
  "id": "tenant_123",
  "name": "Mon Organisation",
  "weezeventWebhookEnabled": true
}
```

---

### 3️⃣ Fournir à Weezevent (2 minutes)

Contactez votre responsable Weezevent et fournissez:

**URL:**
```
https://api.datafriday.com/webhooks/weezevent/VOTRE_TENANT_ID
```

**Secret:** Le secret de l'étape 1

**Type d'événements:** Transaction (create, update, delete)

---

### 4️⃣ Tester (1 minute)

```bash
# Variables
TENANT_ID="votre_tenant_id"
SECRET="votre_secret"
PAYLOAD='{"type":"transaction","method":"create","data":{"id":12345}}'

# Calculer signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# Envoyer test
curl -X POST https://api.datafriday.com/webhooks/weezevent/$TENANT_ID \
  -H "Content-Type: application/json" \
  -H "X-Weezevent-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Résultat attendu:**
```json
{
  "received": true,
  "eventId": "evt_abc123"
}
```

---

### 5️⃣ Vérifier (30 secondes)

```bash
# Vérifier la configuration
curl https://api.datafriday.com/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Résultat:**
```json
{
  "enabled": true,
  "configured": true
}
```

**Ou via Prisma Studio:**
```bash
make dev-studio
# Table: WeezeventWebhookEvent
```

---

## ✅ C'est Prêt !

Vos webhooks sont configurés. Les transactions Weezevent seront automatiquement synchronisées en temps réel.

---

## 📊 Monitoring Rapide

### Voir les Logs

```bash
make dev-logs
```

Filtrez sur: `WebhookController` ou `WebhookEventHandler`

### Voir les Événements

```bash
make dev-studio
```

Table: `WeezeventWebhookEvent`

Colonnes importantes:
- `processed` - Traité ou non
- `error` - Erreur éventuelle
- `createdAt` - Date de réception

---

## 🔧 Commandes Utiles

```bash
# Activer les webhooks
curl -X PATCH .../webhook -d '{"weezeventWebhookEnabled":true}'

# Désactiver les webhooks
curl -X PATCH .../webhook -d '{"weezeventWebhookEnabled":false}'

# Changer le secret
curl -X PATCH .../webhook -d '{"weezeventWebhookSecret":"nouveau_secret"}'

# Vérifier le statut
curl .../webhook -H "Authorization: Bearer JWT"
```

---

## ⚠️ Dépannage Express

### Erreur "Invalid signature"

```bash
# Vérifier le secret
curl https://api.datafriday.com/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN"

# Reconfigurer
curl -X PATCH https://api.datafriday.com/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"weezeventWebhookSecret":"nouveau_secret"}'
```

### Erreur "Webhooks not enabled"

```bash
curl -X PATCH https://api.datafriday.com/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"weezeventWebhookEnabled":true}'
```

### Événements Non Traités

```bash
# Logs
make dev-logs | grep "WebhookEventHandler"

# Base de données
make dev-studio
# SELECT * FROM "WeezeventWebhookEvent" WHERE processed = false;
```

---

## 📚 Documentation Complète

Pour plus de détails, consultez:
- [Guide Complet](./WEEZEVENT_WEBHOOK_SETUP.md)
- [Index Weezevent](./WEEZEVENT_INDEX.md)

---

## 🎯 Script Tout-en-Un

```bash
#!/bin/bash

# Configuration
TENANT_ID="votre_tenant_id"
JWT_TOKEN="votre_jwt_token"
API_URL="https://api.datafriday.com"

# 1. Générer secret
echo "📝 Génération du secret..."
SECRET=$(openssl rand -hex 32)
echo "Secret: $SECRET"

# 2. Configurer DataFriday
echo "🔧 Configuration DataFriday..."
curl -X PATCH $API_URL/onboarding/tenants/$TENANT_ID/webhook \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventWebhookSecret\": \"$SECRET\",
    \"weezeventWebhookEnabled\": true
  }"

# 3. Afficher infos pour Weezevent
echo ""
echo "📋 Informations pour Weezevent:"
echo "URL: $API_URL/webhooks/weezevent/$TENANT_ID"
echo "Secret: $SECRET"

# 4. Test
echo ""
echo "🧪 Test du webhook..."
PAYLOAD='{"type":"transaction","method":"create","data":{"id":999}}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

curl -X POST $API_URL/webhooks/weezevent/$TENANT_ID \
  -H "Content-Type: application/json" \
  -H "X-Weezevent-Signature: $SIG" \
  -d "$PAYLOAD"

echo ""
echo "✅ Configuration terminée!"
```

**Utilisation:**
```bash
chmod +x setup-webhook.sh
./setup-webhook.sh
```

---

## 🎉 Terminé !

Votre intégration webhook est opérationnelle en moins de 5 minutes !
