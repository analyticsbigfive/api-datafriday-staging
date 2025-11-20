# Authentication Multi-Tenant

## Architecture

API NestJS multi-tenant avec Supabase Auth + Prisma ORM.

**Stratégie** : Database Lookup
- JWT Supabase standard (pas besoin d'`org_id` dans le token)
- Le `tenantId` est récupéré depuis la DB à chaque requête
- Sécurisé, simple, flexible

## Frontend : Utilisation du token

```typescript
// 1. S'authentifier avec Supabase
const { data } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// 2. Envoyer le token dans les requêtes
fetch('http://localhost:3000/api/v1/projects', {
  headers: {
    'Authorization': `Bearer ${data.session.access_token}`
  }
})
```

## Backend : Guards disponibles

### JwtOnboardingGuard
Pour l'onboarding (utilisateur sans org encore).

```typescript
@Controller('onboarding')
@UseGuards(JwtOnboardingGuard)
export class OnboardingController { }
```

### JwtDatabaseGuard
Pour les endpoints protégés (avec tenant).

```typescript
@Controller('projects')
@UseGuards(JwtDatabaseGuard)
export class ProjectsController {
  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAll(tenantId);
  }
}
```

## Sécurité Multi-Tenant

**Règle d'or** : TOUJOURS filtrer par `tenantId`.

```typescript
// ✅ BON
async findAll(tenantId: string) {
  return this.prisma.project.findMany({
    where: { tenantId }
  });
}

// ❌ DANGEREUX (retourne tous les tenants)
async findAll() {
  return this.prisma.project.findMany();
}
```

## Commandes

```bash
# Démarrer
make quickstart

# Régénérer Prisma après changement schema
./scripts/regenerate-prisma.sh

# Tests
curl http://localhost:3000/api/v1/health
```
