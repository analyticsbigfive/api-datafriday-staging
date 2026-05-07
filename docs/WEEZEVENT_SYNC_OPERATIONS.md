# Weezevent — Guide opérationnel de synchronisation

> **Modèle multi-instance** : depuis mai 2026, chaque appel de sync est scopé par un `integrationId` (clé `WeezeventIntegration.id`). Un tenant peut avoir plusieurs intégrations Weezevent actives simultanément.

---

## 1. Créer et gérer les intégrations Weezevent

Tous les endpoints de gestion sont sous le préfixe :

```
/organizations/:organizationId/integrations
Authorization: Bearer <jwt>
```

### 1.1 Tester des credentials sans sauvegarder

Toujours tester les credentials **avant** de créer une intégration :

```http
POST /organizations/:organizationId/integrations/weezevent/test
Content-Type: application/json

{
  "weezeventClientId":     "<clientId obtenu dans le backoffice Weezevent>",
  "weezeventClientSecret": "<clientSecret obtenu dans le backoffice Weezevent>"
}
```

Réponse OK : `{ "valid": true, "message": "Connection successful" }`  
Erreur : `400 Bad Request` avec le détail de l'erreur Weezevent.

### 1.2 Créer une intégration (instance)

```http
POST /organizations/:organizationId/integrations/weezevent/instances
Content-Type: application/json

{
  "name":           "Festival 2026",
  "clientId":       "<clientId>",
  "clientSecret":   "<clientSecret>",
  "organizationId": "<organizationId Weezevent — ID numérique de ton org chez Weezevent>",
  "enabled":        true
}
```

| Champ            | Requis | Description |
|------------------|--------|-------------|
| `name`           | Oui    | Nom lisible pour identifier l'intégration |
| `clientId`       | Oui    | Client ID fourni par Weezevent (backoffice → API / OAuth) |
| `clientSecret`   | Oui    | Client Secret correspondant |
| `organizationId` | **Oui** | ID numérique de l'organisation Weezevent — **obligatoire** : tous les endpoints Weezevent sont sous `/organizations/{organizationId}/...` |
| `enabled`        | Non    | `true` par défaut |

> Le backend **valide automatiquement les credentials** contre l'API Weezevent avant de sauvegarder. Un `400` est retourné si invalides.

Réponse `201` : `{ id, name, clientId, organizationId, enabled, createdAt, updatedAt }`.  
**Le champ `id` est l'`integrationId`** à utiliser dans tous les appels de sync.

### 1.3 Lister les intégrations existantes

```http
GET /organizations/:organizationId/integrations/weezevent/instances
```

Retourne un tableau d'instances (`clientSecret` jamais exposé).

### 1.4 Modifier une intégration

```http
PATCH /organizations/:organizationId/integrations/weezevent/instances/:instanceId

{
  "name":           "Nouveau nom",
  "clientId":       "<nouveau clientId>",
  "clientSecret":   "<nouveau clientSecret>",
  "organizationId": "12345",
  "enabled":        false
}
```

Tous les champs sont optionnels. Si `clientId` ou `clientSecret` est fourni, les credentials sont revalidés contre Weezevent avant sauvegarde.

### 1.5 Tester les credentials d'une instance existante

```http
POST /organizations/:organizationId/integrations/weezevent/instances/:instanceId/test
```

Corps optionnel : `{ "clientId": "...", "clientSecret": "..." }`.  
Si omis, utilise les credentials stockés (déchiffrés côté backend).

### 1.6 Supprimer une intégration

```http
DELETE /organizations/:organizationId/integrations/weezevent/instances/:instanceId
```

> ⚠️ Ne supprime pas les données synchronisées. Appeler `DELETE /weezevent/data?integrationId=<id>` séparément si nécessaire.

---

## 3. Synchroniser les données

### Endpoint unique de déclenchement

```http
POST /weezevent/sync
Authorization: Bearer <jwt>
Content-Type: application/json
```

Corps minimal obligatoire — `integrationId` et `type` sont **requis** :

```json
{
  "integrationId": "<WeezeventIntegration.id>",
  "type": "transactions"
}
```

### Types disponibles

| `type`         | Exécution         | Retour                                      | Params supplémentaires |
|----------------|-------------------|---------------------------------------------|------------------------|
| `transactions` | **Synchrone**     | `{ status, syncType, count, itemsSynced, itemsCreated, duration }` | `fromDate`, `full` |
| `events`       | **Synchrone**     | même format                                 | `full` |
| `products`     | **Synchrone**     | même format                                 | `full` |
| `orders`       | **Queue** BullMQ  | `{ jobId, status: "queued", syncType }`     | `eventId` (requis) |
| `prices`       | **Queue** BullMQ  | `{ jobId, status: "queued", syncType }`     | `eventId` (optionnel) |
| `attendees`    | **Queue** BullMQ  | `{ jobId, status: "queued", syncType }`     | `eventId` (requis) |

### Forcer une resynchronisation complète

Ajouter `"full": true` pour ignorer l'état incrémental et retélécharger tout depuis l'API Weezevent :

```json
{
  "integrationId": "<id>",
  "type": "transactions",
  "full": true,
  "fromDate": "2025-01-01T00:00:00Z"
}
```

> **Auto-recovery** : si la base est vide pour ce type+intégration, le backend bascule automatiquement en full sync même sans `full: true`.

---

## 3. Statut de synchronisation

```http
GET /weezevent/sync/status?integrationId=<id>
Authorization: Bearer <jwt>
```

Retourne l'état incrémental (dernier sync, total synced) + stats BullMQ :

```json
{
  "events":       { "lastSyncedAt": "...", "totalSynced": 12, "count": 12 },
  "transactions": { "lastSyncedAt": "...", "totalSynced": 5420, "count": 5420 },
  "products":     { "totalSynced": 48, "count": 48 },
  "queue":        { "waiting": 0, "active": 1, "completed": 42 },
  "jobsProgress": { "transactions": 65 }
}
```

> Si `integrationId` est omis, les `count` reflètent le total toutes intégrations confondues pour ce tenant.

---

## 4. Réinitialiser l'état de synchronisation

Force le prochain sync en full (efface le curseur `lastSyncedAt`) :

```http
DELETE /weezevent/sync/state?integrationId=<id>&type=transactions
Authorization: Bearer <jwt>
```

| Paramètre      | Requis | Description |
|----------------|--------|-------------|
| `integrationId` | Non   | Scope à une intégration. Si omis : reset toutes les intégrations du tenant |
| `type`          | Non   | `transactions` \| `events` \| `products`. Si omis : reset tous les types |

---

## 5. Lire les données synchronisées

Tous les endpoints de lecture acceptent `integrationId` en query param optionnel.

| Endpoint | Description | Params notables |
|----------|-------------|-----------------|
| `GET /weezevent/transactions` | Transactions cashless | `integrationId`*, `status` (W/V/C/R), `fromDate`, `toDate`, `eventId`, `merchantId` |
| `GET /weezevent/transactions/:id` | Détail d'une transaction | — |
| `GET /weezevent/events` | Événements | `integrationId`, `status`, `search`, `startDateFrom`, `startDateTo` |
| `GET /weezevent/products` | Produits / articles | `integrationId`, `category` |
| `GET /weezevent/orders` | Commandes billetterie | `integrationId`, `eventId` |
| `GET /weezevent/prices` | Tarifs billetterie | `integrationId`, `eventId` |
| `GET /weezevent/attendees` | Participants | `integrationId`, `eventId` |
| `GET /weezevent/locations` | Points de vente | `integrationId`, `type` (sale \| all) |
| `GET /weezevent/merchants` | Marchands | `integrationId`, `locationId` |

> \* `integrationId` est **requis** pour `GET /weezevent/transactions` (validé par DTO).

---

## 6. Supprimer les données d'une intégration

```http
DELETE /weezevent/data?integrationId=<id>
Authorization: Bearer <jwt>
```

Supprime en cascade toutes les données (attendees → prices → orders → items → transactions → products → events → syncStates) scopées à cette intégration.

> ⚠️ Sans `integrationId`, supprime **tout** le tenant. À utiliser uniquement lors de la désactivation d'une intégration avec l'option "supprimer les données".

---

## 7. Webhooks entrants

Weezevent pousse les événements en temps réel vers :

```
POST /webhooks/weezevent/:tenantId/:integrationId
Header: x-weezevent-signature: <hmac>
```

Le webhook est **scopé par intégration** dans l'URL. Configurer cette URL dans le backoffice Weezevent pour chaque intégration créée.

---

## 8. Flux d'initialisation d'une nouvelle intégration

```
1. POST /organizations/:orgId/integrations/weezevent/test
       { clientId, clientSecret }  →  vérifier les credentials
2. POST /organizations/:orgId/integrations/weezevent/instances
       { name, clientId, clientSecret, organizationId }  →  récupérer l'integrationId (id interne DataFriday)
3. POST /weezevent/sync  { integrationId, type: "events",       full: true }
4. POST /weezevent/sync  { integrationId, type: "products",     full: true }
5. POST /weezevent/sync  { integrationId, type: "transactions", full: true }
6. POST /weezevent/sync  { integrationId, type: "orders",    eventId: "<id>" }  (optionnel)
7. POST /weezevent/sync  { integrationId, type: "attendees", eventId: "<id>" }  (optionnel)
```

Après l'init, les **cron jobs** prennent le relais automatiquement (sync incrémental toutes les 15 min).

---

## 9. Résumé des codes retour

| Situation | Code HTTP |
|-----------|-----------|
| `integrationId` manquant dans le body (POST /sync) | `400 Bad Request` |
| `integrationId` inconnu ou n'appartenant pas au tenant (webhook) | `400 Bad Request` |
| JWT invalide ou absent | `401 Unauthorized` |
| Signature webhook invalide | `401 Unauthorized` |
| Webhooks désactivés pour ce tenant | `401 Unauthorized` |
| Sync déclenché avec succès (synchrone) | `201 Created` |
| Sync mis en queue BullMQ | `201 Created` (body: `{ status: "queued" }`) |
