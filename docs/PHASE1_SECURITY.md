# 🔐 PHASE 1 - SÉCURITÉ MULTI-TENANT (URGENT)

**Objectif :** Bloquer toutes les fuites de données entre tenants

**Durée estimée :** 1-2 semaines

---

## 📋 Checklist d'implémentation

### 1️⃣ RLS Supabase (Priorité MAX) ⚠️

**Fichier :** `supabase/rls-policies.sql`

#### Étapes :

```bash
# 1. Se connecter à Supabase Dashboard
https://app.supabase.com

# 2. Sélectionner votre projet DEV

# 3. SQL Editor → New Query

# 4. Copier/coller le contenu de supabase/rls-policies.sql

# 5. Exécuter (Run)

# 6. Vérifier que toutes les policies sont créées
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

#### Test RLS :

```sql
-- Se connecter en tant que user avec org_id = 'xxx'
SET request.jwt.claims = '{"org_id": "tenant-123"}';

-- Cette requête ne doit retourner QUE les espaces du tenant-123
SELECT * FROM "Space";

-- Tenter d'insérer avec un autre tenantId → DOIT ÉCHOUER
INSERT INTO "Space" ("tenantId", "name", "capacity") 
VALUES ('tenant-456', 'Hacked Space', 100);
-- ERROR: new row violates row-level security policy
```

---

### 2️⃣ Middleware Prisma Tenant Isolation

**Fichier :** `src/prisma/prisma-tenant.service.ts`

#### Intégration dans NestJS :

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaTenantService } from './prisma/prisma-tenant.service';

@Module({
  providers: [PrismaTenantService],
  exports: [PrismaTenantService],
})
export class AppModule {}
```

#### Utilisation dans un service :

```typescript
// src/spaces/spaces.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma/prisma-tenant.service';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaTenantService) {}

  async findAll() {
    // Le tenantId est AUTOMATIQUEMENT injecté
    return this.prisma.space.findMany();
  }

  async create(data: CreateSpaceDto) {
    // Le tenantId est AUTOMATIQUEMENT ajouté
    return this.prisma.space.create({ data });
  }
}
```

#### Test :

```bash
# Dans le conteneur
docker-compose exec api npm run test:e2e

# Vérifier qu'un tenant A ne peut PAS voir les données du tenant B
```

---

### 3️⃣ JWT Auth avec org_id claims

**Fichiers :**
- `src/common/guards/jwt-tenant.guard.ts`
- `src/common/middleware/tenant.middleware.ts`
- `src/common/decorators/tenant-scoped.decorator.ts`

#### Configuration JWT Strategy :

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      org_id: payload.org_id, // ← IMPORTANT : Inclure dans JWT
      role: payload.role,
    };
  }
}
```

#### Application du Guard globalement :

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtTenantGuard } from './common/guards/jwt-tenant.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Appliquer le guard JWT+Tenant à toutes les routes
  app.useGlobalGuards(new JwtTenantGuard());
  
  await app.listen(3000);
}
bootstrap();
```

#### Utilisation dans un controller :

```typescript
// src/spaces/spaces.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant-scoped.decorator';

@Controller('spaces')
export class SpacesController {
  @Get()
  findAll(@TenantId() tenantId: string) {
    console.log('Tenant ID:', tenantId); // Automatiquement extrait du JWT
    return this.spacesService.findAll();
  }

  @Post()
  create(@Body() data: CreateSpaceDto, @TenantId() tenantId: string) {
    return this.spacesService.create(data);
  }
}
```

---

### 4️⃣ Validation Tenant sur toutes les routes

#### Route publiques (sans auth) :

```typescript
// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public() // ← Bypass JWT guard
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date() };
  }
}
```

#### Routes authentifiées (avec tenant) :

```typescript
// Toutes les autres routes nécessitent JWT + tenantId
@Controller('api/v1/spaces')
export class SpacesController {
  // Pas de @Public() → JWT + tenant requis
  @Get()
  findAll() { ... }
}
```

---

## 🧪 Tests de Sécurité

### Test 1 : Isolation Tenant

```typescript
// test/security/tenant-isolation.e2e-spec.ts
describe('Tenant Isolation', () => {
  it('should NOT allow tenant A to see tenant B data', async () => {
    const tenantAToken = generateJWT({ org_id: 'tenant-a' });
    const tenantBToken = generateJWT({ org_id: 'tenant-b' });

    // Créer space pour tenant A
    await request(app.getHttpServer())
      .post('/api/v1/spaces')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({ name: 'Space A' });

    // Tenant B ne doit PAS voir le space de A
    const response = await request(app.getHttpServer())
      .get('/api/v1/spaces')
      .set('Authorization', `Bearer ${tenantBToken}`);

    expect(response.body).toHaveLength(0);
  });
});
```

### Test 2 : RLS Bypass Impossible

```typescript
it('should NOT allow bypassing tenantId in create', async () => {
  const token = generateJWT({ org_id: 'tenant-a' });

  // Tenter de créer avec un autre tenantId
  const response = await request(app.getHttpServer())
    .post('/api/v1/spaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ 
      name: 'Hacked Space',
      tenantId: 'tenant-b' // ← Doit être ignoré
    });

  const created = await prisma.space.findUnique({
    where: { id: response.body.id }
  });

  // Le tenantId DOIT être celui du JWT, pas celui envoyé
  expect(created.tenantId).toBe('tenant-a');
});
```

---

## 📊 Critères de Validation

| Critère | Statut | Vérification |
|---------|--------|--------------|
| RLS activé sur toutes tables | ⬜ | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';` |
| Middleware Prisma injecte tenantId | ⬜ | Test unitaire |
| JWT contient org_id claim | ⬜ | Décoder un token généré |
| Routes protégées par JwtTenantGuard | ⬜ | Requête sans token → 401 |
| Tenant A isolé de Tenant B | ⬜ | Test e2e isolation |

---

## 🚨 Risques si non implémenté

- ❌ **Fuite de données entre tenants** → Violation RGPD
- ❌ **Vulnérabilité critique** → Client A voit données Client B
- ❌ **Non-conformité légale** → Amendes CNIL/GDPR
- ❌ **Perte de confiance clients** → Churn

---

## ⏭️ Suite : Phase 2 - Production Ready

Une fois Phase 1 validée → Passer à :
- Cloudflare WAF + Rate Limiting
- Observabilité (Sentry + logs)
- CI/CD automatisé
- Backups Supabase

**Voir :** `docs/PHASE2_PRODUCTION.md`
