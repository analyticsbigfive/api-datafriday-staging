# Guide de Migration - Nouvelle Architecture API

## 🎯 Changements

### Nouvelle Structure

**Avant:**
```
POST   /api/v1/onboarding
PATCH  /api/v1/onboarding/tenants/:id/weezevent
GET    /api/v1/onboarding/tenants/:id/weezevent
PATCH  /api/v1/onboarding/tenants/:id/webhook
GET    /api/v1/onboarding/tenants/:id/webhook
```

**Après:**
```
# Onboarding (inchangé)
POST   /api/v1/onboarding

# Organizations (NOUVEAU)
GET    /api/v1/organizations/:id
PATCH  /api/v1/organizations/:id
DELETE /api/v1/organizations/:id

# Integrations (NOUVEAU)
GET    /api/v1/organizations/:id/integrations
PATCH  /api/v1/organizations/:id/integrations/weezevent
GET    /api/v1/organizations/:id/integrations/weezevent
PATCH  /api/v1/organizations/:id/integrations/webhooks
GET    /api/v1/organizations/:id/integrations/webhooks
```

---

## 📋 Nouveaux Endpoints

### Organizations

**GET /api/v1/organizations/:id**
```bash
curl http://localhost:3000/api/v1/organizations/TENANT_ID \
  -H "Authorization: Bearer JWT_TOKEN"
```

**PATCH /api/v1/organizations/:id**
```bash
curl -X PATCH http://localhost:3000/api/v1/organizations/TENANT_ID \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"name":"New Name","logo":"https://...","plan":"PRO"}'
```

**DELETE /api/v1/organizations/:id**
```bash
curl -X DELETE http://localhost:3000/api/v1/organizations/TENANT_ID \
  -H "Authorization: Bearer JWT_TOKEN"
```

### Integrations

**GET /api/v1/organizations/:id/integrations**
```bash
curl http://localhost:3000/api/v1/organizations/TENANT_ID/integrations \
  -H "Authorization: Bearer JWT_TOKEN"
```

**PATCH /api/v1/organizations/:id/integrations/weezevent**
```bash
curl -X PATCH http://localhost:3000/api/v1/organizations/TENANT_ID/integrations/weezevent \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"weezeventClientId":"xxx","weezeventClientSecret":"yyy","weezeventEnabled":true}'
```

**PATCH /api/v1/organizations/:id/integrations/webhooks**
```bash
curl -X PATCH http://localhost:3000/api/v1/organizations/TENANT_ID/integrations/webhooks \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"weezeventWebhookSecret":"secret","weezeventWebhookEnabled":true}'
```

---

## 🔄 Migration Code

### Frontend

**Avant:**
```typescript
// Weezevent config
await fetch(`/api/v1/onboarding/tenants/${tenantId}/weezevent`, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(config)
});
```

**Après:**
```typescript
// Weezevent config
await fetch(`/api/v1/organizations/${tenantId}/integrations/weezevent`, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(config)
});
```

---

## ✅ Checklist Migration

- [ ] Mettre à jour les appels API frontend
- [ ] Tester création organisation
- [ ] Tester config Weezevent
- [ ] Tester config webhooks
- [ ] Vérifier guards JWT
- [ ] Tests end-to-end

---

## 🚀 Déploiement

```bash
# 1. Redémarrer les conteneurs
make dev-down && make dev-up

# 2. Vérifier health
curl http://localhost:3000/api/v1/health

# 3. Tester onboarding
./scripts/test-auth-quick.sh

# 4. Tester nouveaux endpoints
curl http://localhost:3000/api/v1/organizations/TENANT_ID \
  -H "Authorization: Bearer JWT_TOKEN"
```

---

**🎉 Migration terminée !**
