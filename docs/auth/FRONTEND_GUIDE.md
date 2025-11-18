# 📱 Frontend Integration

Comment utiliser l'API d'inscription

---

## 🔐 Flow d'Inscription

### 1. Signup Supabase

```typescript
const { data, error } = await supabase.auth.signUp({
  email: "user@example.com",
  password: "password123"
});

const token = data.session.access_token;
```

### 2. Créer Organisation

```typescript
const response = await fetch('http://localhost:3000/api/v1/onboarding', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: "John",
    lastName: "Doe",
    organizationName: "My Company"
  }),
});

const { tenant, user } = await response.json();
```

---

## 📋 Champs Requis

```typescript
{
  email: string,              // Supabase (validation: email valide)
  password: string,           // Supabase (min 8 chars)
  firstName: string,          // API (2-50 chars)
  lastName: string,           // API (2-50 chars)
  organizationName: string    // API (2-100 chars)
}
```

---

## 📡 Endpoint

**POST /api/v1/onboarding**

Headers: `Authorization: Bearer <jwt>`

Body:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "My Company"
}
```

Response:
```json
{
  "tenant": {
    "id": "...",
    "name": "My Company",
    "slug": "my-company",
    "plan": "FREE",
    "status": "TRIAL"
  },
  "user": {
    "id": "...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN"
  }
}
```

Errors:
- `401` - Token invalide
- `409` - User déjà inscrit
- `400` - Données invalides

---

## 🔗 Config Supabase

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```
