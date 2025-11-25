# Guide de Configuration - Webhooks Weezevent

## 📋 Vue d'ensemble

Les webhooks Weezevent permettent de recevoir des notifications en temps réel lorsque des transactions sont créées, modifiées ou supprimées dans le système Weezevent.

**Avantages:**
- ✅ Synchronisation temps réel (pas de polling)
- ✅ Économie d'appels API
- ✅ Réduction de la latence
- ✅ Audit complet des événements

---

## 🔧 Configuration

### Étape 1: Configurer le Secret Webhook

Le secret webhook est utilisé pour valider l'authenticité des requêtes provenant de Weezevent.

**Endpoint:** `PATCH /onboarding/tenants/:tenantId/webhook`

```bash
curl -X PATCH https://api.datafriday.com/onboarding/tenants/VOTRE_TENANT_ID/webhook \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "weezeventWebhookSecret": "votre_secret_securise_ici",
    "weezeventWebhookEnabled": true
  }'
```

**Réponse:**
```json
{
  "id": "tenant_123",
  "name": "Mon Organisation",
  "slug": "mon-organisation",
  "weezeventWebhookEnabled": true
}
```

**💡 Conseil:** Générez un secret fort avec:
```bash
openssl rand -hex 32
```

### Étape 2: Fournir l'URL à Weezevent

Contactez votre responsable Weezevent et fournissez:

**URL du webhook:**
```
https://api.datafriday.com/webhooks/weezevent/{VOTRE_TENANT_ID}
```

**Secret:** Le secret configuré à l'étape 1

**Type d'événements:** Transaction (create, update, delete)

---

## 📨 Format des Webhooks

### Requête Weezevent

**Méthode:** `POST`

**Headers:**
```
Content-Type: application/json
X-Weezevent-Signature: <hmac_sha256_signature>
```

**Body:**
```json
{
  "type": "transaction",
  "method": "create",
  "data": {
    "id": 12345,
    "status": "V",
    "amount": 1500,
    "wallet_id": 789,
    "event_id": 100,
    "created": "2024-11-25T10:00:00Z",
    "rows": [
      {
        "id": 1,
        "item_id": 10,
        "unit_price": 1500,
        "payments": [...]
      }
    ]
  },
  "timestamp": "2024-11-25T10:00:01Z"
}
```

### Réponse DataFriday

**Succès (200 OK):**
```json
{
  "received": true,
  "eventId": "evt_abc123"
}
```

**Erreurs:**
- `400` - Tenant non trouvé
- `401` - Webhooks non activés ou signature invalide
- `500` - Erreur serveur

---

## 🔐 Sécurité

### Validation de Signature

DataFriday valide automatiquement la signature HMAC SHA256 de chaque webhook.

**Algorithme:**
```
HMAC-SHA256(payload_json, secret) = signature
```

**Exemple de vérification (Node.js):**
```javascript
const crypto = require('crypto');

function validateSignature(payload, signature, secret) {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computed)
  );
}
```

### Bonnes Pratiques

1. **Secret Fort:** Utilisez un secret d'au moins 32 caractères
2. **HTTPS Uniquement:** Jamais en HTTP
3. **Rotation:** Changez le secret périodiquement
4. **Logs:** Surveillez les tentatives de signature invalide

---

## 📊 Monitoring

### Vérifier le Statut

**Endpoint:** `GET /onboarding/tenants/:tenantId/webhook`

```bash
curl https://api.datafriday.com/onboarding/tenants/VOTRE_TENANT_ID/webhook \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN"
```

**Réponse:**
```json
{
  "enabled": true,
  "configured": true
}
```

### Consulter les Événements

Les webhooks reçus sont stockés dans la table `WeezeventWebhookEvent` pour audit.

**Accès via Prisma Studio:**
```bash
make dev-studio
```

**Champs disponibles:**
- `id` - ID unique de l'événement
- `tenantId` - Tenant concerné
- `eventType` - Type (transaction)
- `method` - Méthode (create/update/delete)
- `payload` - Payload complet JSON
- `signature` - Signature reçue
- `processed` - Traité ou non
- `processedAt` - Date de traitement
- `error` - Erreur éventuelle
- `retryCount` - Nombre de tentatives
- `createdAt` - Date de réception

---

## 🔄 Traitement des Événements

### Flux de Traitement

```
1. Réception webhook
   ↓
2. Validation signature
   ↓
3. Stockage en base (audit)
   ↓
4. Retour 200 OK (immédiat)
   ↓
5. Traitement asynchrone
   ↓
6. Synchronisation transaction
```

### Types d'Événements

#### Transaction Created
```json
{
  "type": "transaction",
  "method": "create",
  "data": { ... }
}
```
**Action:** Synchronise la nouvelle transaction depuis l'API Weezevent

#### Transaction Updated
```json
{
  "type": "transaction",
  "method": "update",
  "data": { ... }
}
```
**Action:** Met à jour la transaction existante

#### Transaction Deleted
```json
{
  "type": "transaction",
  "method": "delete",
  "data": { "id": 12345 }
}
```
**Action:** Marque la transaction comme supprimée

---

## 🧪 Tests

### Test Manuel avec cURL

```bash
# 1. Générer une signature
SECRET="votre_secret"
PAYLOAD='{"type":"transaction","method":"create","data":{"id":12345}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# 2. Envoyer le webhook
curl -X POST https://api.datafriday.com/webhooks/weezevent/VOTRE_TENANT_ID \
  -H "Content-Type: application/json" \
  -H "X-Weezevent-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Test avec Payload Complet

```bash
curl -X POST https://api.datafriday.com/webhooks/weezevent/VOTRE_TENANT_ID \
  -H "Content-Type: application/json" \
  -H "X-Weezevent-Signature: SIGNATURE_CALCULEE" \
  -d '{
    "type": "transaction",
    "method": "create",
    "data": {
      "id": 12345,
      "status": "V",
      "amount": 1500,
      "wallet_id": 789,
      "event_id": 100,
      "created": "2024-11-25T10:00:00Z",
      "rows": [
        {
          "id": 1,
          "item_id": 10,
          "unit_price": 1500,
          "vat": 10,
          "payments": [
            {
              "id": 1,
              "wallet_id": 789,
              "amount": 1500,
              "currency_id": 1,
              "quantity": 1
            }
          ]
        }
      ]
    },
    "timestamp": "2024-11-25T10:00:01Z"
  }'
```

---

## ⚠️ Dépannage

### Erreur: "Signature header missing"

**Cause:** Header `X-Weezevent-Signature` absent

**Solution:** Vérifiez que Weezevent envoie bien le header avec le secret configuré

### Erreur: "Invalid signature"

**Causes possibles:**
1. Secret incorrect dans la configuration
2. Format du payload différent
3. Encodage du payload

**Solution:**
```bash
# Vérifier le secret configuré
curl https://api.datafriday.com/onboarding/tenants/TENANT_ID/webhook \
  -H "Authorization: Bearer JWT_TOKEN"

# Reconfigurer si nécessaire
curl -X PATCH https://api.datafriday.com/onboarding/tenants/TENANT_ID/webhook \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"weezeventWebhookSecret":"nouveau_secret"}'
```

### Erreur: "Webhooks not enabled"

**Solution:**
```bash
curl -X PATCH https://api.datafriday.com/onboarding/tenants/TENANT_ID/webhook \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"weezeventWebhookEnabled":true}'
```

### Événement Non Traité

**Vérification:**
1. Consultez les logs Docker:
   ```bash
   make dev-logs
   ```

2. Vérifiez la table `WeezeventWebhookEvent`:
   ```sql
   SELECT * FROM "WeezeventWebhookEvent" 
   WHERE processed = false 
   ORDER BY "createdAt" DESC;
   ```

3. Vérifiez le champ `error` pour les détails

---

## 📈 Performance

### Latence

- **Réception:** < 100ms (retour 200 OK)
- **Traitement:** 1-5 secondes (asynchrone)
- **Synchronisation:** Selon taille de la transaction

### Capacité

- **Rate limit:** 10 webhooks/seconde par tenant
- **Payload max:** 1 MB
- **Timeout:** 10 secondes

---

## 🔄 Migration depuis Polling

Si vous utilisez actuellement le polling (Phase 5), voici comment migrer:

### 1. Activer les Webhooks

```bash
# Configurer le webhook
curl -X PATCH .../webhook -d '{"weezeventWebhookEnabled":true,"weezeventWebhookSecret":"..."}'
```

### 2. Tester en Parallèle

Gardez le polling actif pendant 24-48h pour vérifier que tous les événements sont bien reçus.

### 3. Désactiver le Polling

Une fois les webhooks validés, désactivez le polling pour économiser les ressources.

---

## 📞 Support

**Documentation:**
- [Index Weezevent](../WEEZEVENT_INDEX.md)
- [API Client](../WEEZEVENT_API_CLIENT_USAGE.md)
- [Synchronisation](../WEEZEVENT_SYNC_USER_GUIDE.md)

**Logs:**
```bash
# Logs en temps réel
make dev-logs

# Logs webhook spécifiques
docker logs datafriday-api-dev 2>&1 | grep "WebhookController\|WebhookEventHandler"
```

**Base de données:**
```bash
# Prisma Studio
make dev-studio

# psql direct
make supabase-psql
```

---

## ✅ Checklist de Configuration

- [ ] Secret webhook généré (32+ caractères)
- [ ] Secret configuré via API
- [ ] Webhooks activés (`weezeventWebhookEnabled: true`)
- [ ] URL fournie à Weezevent
- [ ] Secret partagé avec Weezevent
- [ ] Test manuel effectué
- [ ] Monitoring en place
- [ ] Logs vérifiés

---

## 🎯 Exemple Complet

```bash
# 1. Générer un secret
SECRET=$(openssl rand -hex 32)
echo "Secret: $SECRET"

# 2. Configurer DataFriday
curl -X PATCH https://api.datafriday.com/onboarding/tenants/tenant_123/webhook \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d "{
    \"weezeventWebhookSecret\": \"$SECRET\",
    \"weezeventWebhookEnabled\": true
  }"

# 3. Fournir à Weezevent
echo "URL: https://api.datafriday.com/webhooks/weezevent/tenant_123"
echo "Secret: $SECRET"

# 4. Tester
PAYLOAD='{"type":"transaction","method":"create","data":{"id":999}}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

curl -X POST https://api.datafriday.com/webhooks/weezevent/tenant_123 \
  -H "Content-Type: application/json" \
  -H "X-Weezevent-Signature: $SIG" \
  -d "$PAYLOAD"

# 5. Vérifier
curl https://api.datafriday.com/onboarding/tenants/tenant_123/webhook \
  -H "Authorization: Bearer eyJ..."
```

**Résultat attendu:** `{"received":true,"eventId":"evt_..."}`

---

## 🚀 Prêt !

Votre configuration webhook est maintenant opérationnelle. Les transactions Weezevent seront automatiquement synchronisées en temps réel.
