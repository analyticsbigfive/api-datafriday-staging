# API Reference - DataFriday

## Base URL

```
Production: https://api.datafriday.com
Development: http://localhost:3000
```

**API Version:** v1  
**Prefix:** `/api/v1`

---

## Authentication

All endpoints (except webhooks) require JWT authentication via Supabase.

**Header:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Guards:**
- `JwtOnboardingGuard` - Supabase JWT uniquement
- `JwtDatabaseGuard` - JWT + vérification tenant en DB

---

## Endpoints

### Health

#### GET /api/v1/health

Health check endpoint.

**Auth:** None

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" }
  }
}
```

---

### Onboarding

#### POST /api/v1/onboarding

Create organization and admin user after Supabase authentication.

**Auth:** JwtOnboardingGuard

**Body:**
```json
{
  "organizationName": "My Company",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "tenant": {
    "id": "tenant_123",
    "name": "My Company",
    "slug": "my-company",
    "plan": "FREE",
    "status": "TRIAL"
  },
  "user": {
    "id": "user_456",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN"
  }
}
```

---

### Organizations

#### GET /api/v1/organizations/:id

Get organization details.

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "id": "tenant_123",
  "name": "My Company",
  "slug": "my-company",
  "logo": "https://...",
  "plan": "FREE",
  "status": "ACTIVE",
  "createdAt": "2024-11-25T10:00:00Z",
  "updatedAt": "2024-11-25T10:00:00Z"
}
```

#### PATCH /api/v1/organizations/:id

Update organization.

**Auth:** JwtDatabaseGuard

**Body:**
```json
{
  "name": "New Name",
  "logo": "https://...",
  "plan": "PRO"
}
```

**Response:** Updated organization object

#### DELETE /api/v1/organizations/:id

Soft delete organization (sets status to SUSPENDED).

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "id": "tenant_123",
  "name": "My Company",
  "status": "SUSPENDED"
}
```

---

### Integrations

#### GET /api/v1/organizations/:id/integrations

List all integrations for an organization.

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "weezevent": {
    "clientId": "xxx",
    "enabled": true,
    "configured": true
  },
  "webhooks": {
    "enabled": true,
    "configured": true
  }
}
```

#### PATCH /api/v1/organizations/:id/integrations/weezevent

Configure Weezevent integration.

**Auth:** JwtDatabaseGuard

**Body:**
```json
{
  "weezeventClientId": "your_client_id",
  "weezeventClientSecret": "your_client_secret",
  "weezeventEnabled": true
}
```

**Response:**
```json
{
  "id": "tenant_123",
  "name": "My Company",
  "weezeventClientId": "your_client_id",
  "weezeventEnabled": true
}
```

#### GET /api/v1/organizations/:id/integrations/weezevent

Get Weezevent configuration (public info only).

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "clientId": "your_client_id",
  "enabled": true,
  "configured": true
}
```

#### PATCH /api/v1/organizations/:id/integrations/webhooks

Configure webhooks.

**Auth:** JwtDatabaseGuard

**Body:**
```json
{
  "weezeventWebhookSecret": "your_secret",
  "weezeventWebhookEnabled": true
}
```

**Response:**
```json
{
  "id": "tenant_123",
  "name": "My Company",
  "weezeventWebhookEnabled": true
}
```

#### GET /api/v1/organizations/:id/integrations/webhooks

Get webhook configuration.

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "enabled": true,
  "configured": true
}
```

---

### Weezevent

#### GET /api/v1/weezevent/transactions

List transactions.

**Auth:** JwtDatabaseGuard

**Query Parameters:**
- `limit` (optional): Number of results (default: 100)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "data": [
    {
      "id": "trans_123",
      "weezeventId": "12345",
      "amount": 25.50,
      "status": "V",
      "transactionDate": "2024-11-25T10:00:00Z"
    }
  ],
  "total": 150
}
```

#### POST /api/v1/weezevent/sync

Trigger manual synchronization.

**Auth:** JwtDatabaseGuard

**Response:**
```json
{
  "message": "Synchronization started",
  "jobId": "job_789"
}
```

---

### Webhooks

#### POST /api/v1/webhooks/weezevent/:tenantId

Receive Weezevent webhook events.

**Auth:** Signature validation (HMAC SHA256)

**Headers:**
```
X-Weezevent-Signature: <hmac_sha256_signature>
Content-Type: application/json
```

**Body:**
```json
{
  "type": "transaction",
  "method": "create",
  "data": {
    "id": 12345,
    "amount": 25.50
  }
}
```

**Response:**
```json
{
  "received": true,
  "eventId": "evt_abc123"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Organization not found"
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## Rate Limiting

- Default: 100 requests per minute per IP
- Authenticated: 1000 requests per minute per user

---

## Pagination

Use `limit` and `offset` query parameters:

```
GET /api/v1/weezevent/transactions?limit=50&offset=100
```

---

## Versioning

Current version: **v1**

All endpoints are prefixed with `/api/v1/`.

Future versions will be available at `/api/v2/`, etc.

---

## Examples

See [AUTH_TESTING_GUIDE.md](./AUTH_TESTING_GUIDE.md) for complete examples.
