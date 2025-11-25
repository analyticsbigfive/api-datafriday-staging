# API Architecture - DataFriday

## 🏗️ Architecture Overview

DataFriday API est construite avec NestJS et suit une architecture modulaire multi-tenant.

### Stack Technique

- **Framework:** NestJS 10.x
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Prisma
- **Authentication:** Supabase Auth + JWT
- **Deployment:** Docker

---

## 📐 Structure Modulaire

```
src/
├── core/                    # Modules transversaux
│   ├── auth/               # Authentication & Guards
│   ├── database/           # Prisma service
│   ├── encryption/         # Encryption service
│   └── cache/              # Cache service
│
├── features/               # Modules métier
│   ├── onboarding/        # Création organisation
│   ├── organizations/     # Gestion organisations
│   ├── integrations/      # Intégrations tierces
│   └── weezevent/         # Intégration Weezevent
│
└── health/                # Health checks
```

---

## 🔐 Authentication Flow

### 1. Signup/Login (Supabase)
```
User → Supabase Auth → JWT Token
```

### 2. Onboarding
```
JWT Token → POST /api/v1/onboarding → Create Tenant + User
```

### 3. API Access
```
JWT Token → JwtDatabaseGuard → Verify Tenant → Access Resources
```

---

## 🎯 Modules

### Core Modules

#### AuthModule
- JWT strategies (Onboarding, Database)
- Guards (JwtOnboardingGuard, JwtDatabaseGuard)
- Decorators (@CurrentUser)

#### PrismaModule
- Database connection
- Transaction management
- Multi-tenant isolation

#### EncryptionModule
- AES-256-GCM encryption
- Secure credential storage

#### CacheModule
- In-memory caching
- TTL management
- Pattern invalidation

### Feature Modules

#### OnboardingModule
**Responsabilité:** Création initiale d'organisation

**Endpoints:**
- `POST /api/v1/onboarding`

**Flow:**
1. User authentifié via Supabase
2. Création Tenant (organization)
3. Création User (admin)
4. Retour credentials

#### OrganizationsModule
**Responsabilité:** Gestion des organisations/tenants

**Endpoints:**
- `GET /api/v1/organizations/:id`
- `PATCH /api/v1/organizations/:id`
- `DELETE /api/v1/organizations/:id`

**Features:**
- CRUD operations
- Soft delete (SUSPENDED status)
- Tenant isolation

#### IntegrationsModule
**Responsabilité:** Configuration intégrations tierces

**Endpoints:**
- `GET /api/v1/organizations/:id/integrations`
- `PATCH /api/v1/organizations/:id/integrations/weezevent`
- `GET /api/v1/organizations/:id/integrations/weezevent`
- `PATCH /api/v1/organizations/:id/integrations/webhooks`
- `GET /api/v1/organizations/:id/integrations/webhooks`

**Services:**
- `WeezeventIntegrationService` - Config Weezevent
- `WebhookIntegrationService` - Config webhooks

**Features:**
- Credential encryption
- Configuration validation
- Multi-integration support

#### WeezeventModule
**Responsabilité:** Intégration Weezevent complète

**Endpoints:**
- `GET /api/v1/weezevent/transactions`
- `POST /api/v1/weezevent/sync`
- `GET /api/v1/weezevent/events`
- `POST /api/v1/webhooks/weezevent/:tenantId`

**Services:**
- `WeezeventApiClient` - API client OAuth2
- `WeezeventSyncService` - Synchronisation données
- `WebhookController` - Réception webhooks
- `WebhookEventHandler` - Traitement événements

---

## 🔄 API Versioning

### RouterModule Configuration

```typescript
RouterModule.register([
  {
    path: 'v1',
    children: [
      { path: 'onboarding', module: OnboardingModule },
      { path: 'organizations', module: OrganizationsModule },
      { path: 'weezevent', module: WeezeventModule },
    ],
  },
])
```

**Résultat:**
- Toutes les routes préfixées `/api/v1/`
- Facilite l'ajout de v2, v3, etc.

---

## 🗄️ Data Model

### Tenant (Organization)
```prisma
model Tenant {
  id                        String
  name                      String
  slug                      String
  plan                      TenantPlan
  status                    TenantStatus
  weezeventClientId         String?
  weezeventClientSecret     String?  // Encrypted
  weezeventEnabled          Boolean
  weezeventWebhookSecret    String?
  weezeventWebhookEnabled   Boolean
}
```

### User
```prisma
model User {
  id          String
  email       String
  firstName   String
  lastName    String
  role        UserRole
  tenantId    String
}
```

### Weezevent Models
- `WeezeventTransaction`
- `WeezeventTransactionItem`
- `WeezeventEvent`
- `WeezeventProduct`
- `WeezeventWallet`
- `WeezeventWebhookEvent`

---

## 🔒 Security

### Multi-Tenant Isolation

**Database Level:**
```typescript
// Tous les modèles ont un tenantId
where: { tenantId: user.tenantId }
```

**Guard Level:**
```typescript
@UseGuards(JwtDatabaseGuard)
// Vérifie que user.tenantId existe en DB
```

### Encryption

**Sensitive Data:**
- `weezeventClientSecret` - AES-256-GCM
- `weezeventWebhookSecret` - Stocké en clair (pour validation)

**Method:**
```typescript
const encrypted = encryptionService.encrypt(secret);
// Format: iv:authTag:encryptedData
```

### Webhook Security

**HMAC SHA256 Signature:**
```typescript
const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');
```

**Validation:**
```typescript
crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(computedSignature)
);
```

---

## ⚡ Performance

### Caching Strategy

**In-Memory Cache:**
- Analytics: 5-15 minutes
- Static data: 1 hour
- Real-time: 30 seconds

**Invalidation:**
```typescript
// Après webhook
cache.invalidatePattern(`^revenue:${tenantId}:`);

// Après sync
cache.invalidatePattern(`^analytics:${tenantId}:`);
```

### Database Optimization

**Composite Indexes:**
```prisma
@@index([tenantId, status, transactionDate])
@@index([tenantId, eventId, status])
@@index([eventId, transactionDate])
@@index([productId, transactionId])
```

**Query Optimization:**
- Pagination cursor-based
- Select specific fields
- Avoid N+1 queries

---

## 🔄 Webhook Flow

```
Weezevent → POST /webhooks/weezevent/:tenantId
           ↓
        Signature Validation
           ↓
        Store Event (WeezeventWebhookEvent)
           ↓
        Return 200 OK (< 100ms)
           ↓
        Async Processing
           ↓
        Sync Transaction
```

---

## 📊 Monitoring

### Health Checks
```
GET /api/v1/health
```

### Logs
```bash
make dev-logs
```

### Database
```bash
make dev-studio
```

---

## 🚀 Deployment

### Docker
```bash
make dev-up      # Development
make prod-up     # Production
```

### Environment Variables
```env
DATABASE_URL
SUPABASE_URL
SUPABASE_JWT_SECRET
ENCRYPTION_KEY
```

---

## 📈 Scalability

### Horizontal Scaling
- Stateless API (cache in-memory peut être remplacé par Redis)
- Database connection pooling
- Load balancer ready

### Vertical Scaling
- Optimized queries
- Efficient caching
- Async processing

---

## 🔮 Future Enhancements

### v2 API
- GraphQL support
- Real-time subscriptions
- Advanced filtering

### Additional Integrations
- Stripe
- Mailchimp
- Analytics platforms

### Performance
- Redis cache
- CDN for static assets
- Query result caching

---

**Architecture designed for scalability, security, and maintainability.**
