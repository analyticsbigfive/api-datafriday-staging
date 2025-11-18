# 📡 API Reference

Routes disponibles pour le frontend

---

## Authentication & Onboarding

### POST /api/v1/onboarding

Créer une organisation et un utilisateur admin après l'authentification Supabase.

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "My Company"
}
```

**Validation:**
- `firstName`: string, 2-50 caractères, requis
- `lastName`: string, 2-50 caractères, requis
- `organizationName`: string, 2-100 caractères, requis

**Success Response (201):**
```json
{
  "tenant": {
    "id": "cltx...",
    "name": "My Company",
    "slug": "my-company",
    "plan": "FREE",
    "status": "TRIAL"
  },
  "user": {
    "id": "auth0|123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN"
  }
}
```

**Error Responses:**

- **401 Unauthorized**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

- **409 Conflict** (user déjà inscrit)
```json
{
  "statusCode": 409,
  "message": "User already has an organization",
  "error": "ConflictException"
}
```

- **400 Bad Request** (validation échouée)
```json
{
  "statusCode": 400,
  "message": [
    "userName must be longer than or equal to 2 characters",
    "organizationName should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## Health Check

### GET /api/v1/health

Vérifier l'état de l'API.

**Headers:** Aucun

**Success Response (200):**
```json
{
  "status": "ok",
  "message": "API is running",
  "timestamp": "2024-11-17T08:45:00.000Z",
  "version": "1.0.0",
  "phase": "Phase 1 Complete - Core Infrastructure"
}
```

### GET /api/v1/health/protected

Health check protégé (nécessite authentification).

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
```

**Success Response (200):**
```json
{
  "message": "Authentication successful!",
  "user": {
    "id": "auth0|123",
    "email": "user@example.com",
    "role": "ADMIN"
  },
  "tenantId": "tenant-123",
  "timestamp": "2024-11-17T08:45:00.000Z"
}
```

---

## Tenant Plans

| Plan | Status | Features |
|------|--------|----------|
| **FREE** | Permanent | 3 spaces, 50 menu items, 2 users |
| **TRIAL** | 30 jours | Toutes les features PRO |
| **STARTER** | Payant | 10 spaces, 200 menu items, 5 users |
| **PROFESSIONAL** | Payant | 50 spaces, illimité menu items, 20 users |
| **ENTERPRISE** | Payant | Illimité tout |

**Notes:**
- Nouveau tenant → `TRIAL` pendant 30 jours
- Après trial → downgrade vers `FREE` ou upgrade payant
- Slug auto-généré depuis `organizationName`

---

## User Roles

| Role | Permissions |
|------|-------------|
| **ADMIN** | Toutes les permissions, gestion tenant |
| **MANAGER** | Gestion users, spaces, menu items |
| **STAFF** | Consultation, édition limitée |
| **VIEWER** | Lecture seule |

**Note:** Premier user créé = toujours ADMIN
