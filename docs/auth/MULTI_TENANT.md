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

## Stratégie recommandée : données `system` et données `tenant`

### Convention

- `tenantId = null` : donnée système partagée
- `tenantId = currentTenantId` : donnée privée au tenant

### Lecture des données

- données privées : `where: { tenantId: currentTenantId }`
- référentiels partageables :

```typescript
where: {
  OR: [
    { tenantId: currentTenantId },
    { tenantId: null },
  ],
}
```

### Création

- ne jamais accepter `tenantId` depuis le body
- toujours injecter `tenantId` depuis `@CurrentTenant()` ou depuis le guard

### Update / Delete

- un tenant ne peut modifier ou supprimer que ses propres données
- les données système doivent être gérées par des endpoints admin dédiés
- ne jamais faire `update` ou `delete` sur `id` seul sans vérification d'appartenance

### Validation des relations

Lors d'un `connect`, la cible doit être :

- soit dans le tenant courant
- soit une donnée système `tenantId = null`

Exemple : un `productCategory` d'un tenant ne doit jamais pouvoir se connecter à un `productType` privé d'un autre tenant.

## Ordre recommandé d'implémentation

1. Forcer les contrôleurs à utiliser `@CurrentTenant()` pour toutes les écritures.
2. Filtrer toutes les lectures métier par `tenantId`.
3. Autoriser explicitement `tenantId = null` uniquement sur les référentiels partagés.
4. Vérifier l'appartenance tenant avant tout `update` / `delete`.
5. Vérifier l'accessibilité des relations avant tout `connect`.
6. Couvrir chaque règle avec des tests ciblés.

## Modules déjà durcis

- `events`
- `menu-items`
- `product-types`
- `product-categories`
- accès aux `spaces` et aux `configurations`
- cache/version du `space-dashboard`
