# 🔒 Security Best Practices

## 1. Données d'authentification exposées au frontend

### ❌ Problème : Exposition de données sensibles

Supabase retourne par défaut beaucoup d'informations sensibles qui ne sont pas nécessaires au frontend :

```json
{
  "access_token": "...",
  "user": {
    "id": "...",
    "email": "...",
    "email_confirmed_at": "...",  // ❌ Non nécessaire
    "confirmation_sent_at": "...", // ❌ Non nécessaire
    "last_sign_in_at": "...",      // ❌ Non nécessaire
    "app_metadata": {...},          // ❌ Données système
    "identities": [...],            // ❌ Informations d'identité complètes
    "created_at": "...",            // ❌ Non nécessaire
    "updated_at": "..."             // ❌ Non nécessaire
  }
}
```

### ✅ Solution implémentée

Filtrage des données utilisateur dans le store d'authentification :

```javascript
// frontend/src/stores/auth.js
function sanitizeUserData(userData) {
  if (!userData) return null
  
  return {
    id: userData.id,
    email: userData.email,
    user_metadata: {
      first_name: userData.user_metadata?.first_name,
      last_name: userData.user_metadata?.last_name,
      email: userData.user_metadata?.email,
    },
    role: userData.role,
  }
}
```

### 📊 Champs autorisés au frontend

| Champ | Nécessaire | Raison |
|-------|-----------|---------|
| `access_token` | ✅ | Authentification API |
| `refresh_token` | ✅ | Renouvellement de session |
| `token_type` | ✅ | Type de token (Bearer) |
| `expires_in` / `expires_at` | ✅ | Gestion expiration |
| `user.id` | ✅ | Identifiant unique |
| `user.email` | ✅ | Affichage/contact |
| `user.user_metadata.first_name` | ✅ | Affichage nom |
| `user.user_metadata.last_name` | ✅ | Affichage nom |
| `user.role` | ✅ | Permissions UI |
| **Tout le reste** | ❌ | **Données internes** |

---

## 2. JWT Tokens

### 🔐 Access Token
- **Stockage** : Memory (Pinia store)
- **Durée de vie** : 1 heure (3600s)
- **Transmission** : Header `Authorization: Bearer <token>`
- **Ne JAMAIS stocker dans** : LocalStorage, SessionStorage, Cookies non-HttpOnly

### 🔄 Refresh Token
- **Stockage** : Géré automatiquement par Supabase (HttpOnly Cookie)
- **Durée de vie** : 30 jours
- **Usage** : Renouvellement automatique de l'access token

---

## 3. API Backend

### 🛡️ Validation des tokens

Le backend **ne fait JAMAIS confiance** aux données du JWT token sans vérification :

```typescript
// src/core/auth/strategies/jwt-db-lookup.strategy.ts
async validate(payload: JwtPayload) {
  // 1. Valider le token JWT
  // 2. Vérifier que l'utilisateur existe en DB
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub }
  })
  
  if (!user) {
    throw new UnauthorizedException('User not found')
  }
  
  // 3. Vérifier que le tenant est actif
  if (user.tenant.status === 'SUSPENDED') {
    throw new UnauthorizedException('Organization suspended')
  }
  
  // 4. Retourner UNIQUEMENT les données nécessaires
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    role: user.role,
    tenantId: user.tenantId,
  }
}
```

### 📋 Sanitisation des réponses API

```typescript
// src/features/users/users.service.ts
private sanitizeUser(user: any) {
  // Supprimer les champs sensibles avant de retourner
  const { 
    password,      // ❌ Jamais
    ...sanitized 
  } = user
  return sanitized
}
```

---

## 4. Variables d'environnement

### ❌ Ne JAMAIS exposer au frontend

```env
# Backend only
DATABASE_URL="postgresql://..."
SUPABASE_SERVICE_ROLE_KEY="..."  # ⚠️ ADMIN KEY
JWT_SECRET="..."
ENCRYPTION_KEY="..."
```

### ✅ OK pour le frontend

```env
# Frontend
VITE_SUPABASE_URL="https://xxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."  # Public key (limitée par RLS)
VITE_API_URL="https://api.example.com"
```

---

## 5. Row Level Security (RLS)

Toutes les tables Supabase doivent avoir des politiques RLS activées :

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Policy: Admin can view all users in their tenant
CREATE POLICY "Admins can view tenant users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.tenant_id = users.tenant_id
        AND u.role = 'ADMIN'
    )
  );
```

---

## 6. Rate Limiting

### API Backend

```typescript
// main.ts
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limite 100 requêtes
  })
)
```

### Supabase Auth

Configuré dans le dashboard Supabase :
- **Login attempts** : 5 tentatives / 10 minutes / IP
- **Signup** : 10 inscriptions / heure / IP

---

## 7. CORS

```typescript
// main.ts
app.enableCors({
  origin: [
    'http://localhost:5173',  // Dev
    'https://app.example.com', // Production
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
})
```

---

## 8. Validation des données

### Toujours valider côté backend

```typescript
// dto/create-user.dto.ts
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string

  @IsEnum(UserRole)
  role: UserRole
}
```

### Ne jamais faire confiance au frontend

❌ **Mauvais** :
```typescript
// Prendre directement les données du body
const user = await prisma.user.create({ data: req.body })
```

✅ **Bon** :
```typescript
// Valider avec DTO + ValidationPipe
async create(@Body() dto: CreateUserDto) {
  // DTO validé automatiquement
  return this.service.create(dto)
}
```

---

## 9. Logging sécurisé

### ❌ Ne JAMAIS logger

- Mots de passe
- Tokens JWT complets
- Clés API
- Données sensibles (SSN, carte bancaire, etc.)

### ✅ Logger de manière sécurisée

```typescript
// ❌ Mauvais
this.logger.log(`User login: ${email} with token ${token}`)

// ✅ Bon
this.logger.log(`User login: ${email}`)
this.logger.debug(`Token prefix: ${token.substring(0, 10)}...`)
```

---

## 10. Checklist de sécurité

### Avant chaque déploiement

- [ ] Les variables d'environnement sensibles sont sécurisées
- [ ] RLS activé sur toutes les tables Supabase
- [ ] Validation des DTOs sur tous les endpoints
- [ ] Authentification requise sur les routes protégées
- [ ] CORS configuré avec les bons domaines
- [ ] Rate limiting activé
- [ ] Logs sécurisés (pas de données sensibles)
- [ ] Sanitisation des données utilisateur avant envoi au frontend
- [ ] HTTPS activé en production
- [ ] Dépendances à jour (npm audit)

### Tests de sécurité

```bash
# Vérifier les vulnérabilités
npm audit

# Scanner les secrets dans le code
npm install -g gitleaks
gitleaks detect

# Tester l'authentification
npm run test:e2e auth
```

---

## 11. Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security-best-practices)
- [NestJS Security](https://docs.nestjs.com/security/authentication)
- [JWT Security Best Practices](https://tools.ietf.org/html/rfc8725)

---

## 📞 Contact

En cas de découverte de vulnérabilité de sécurité, contactez immédiatement :
- **Email** : security@bigfiveabidjan.com
- **Process** : Responsible disclosure policy
