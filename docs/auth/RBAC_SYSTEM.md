# RBAC System — Rôles & Permissions dynamiques

> **Statut** : design / cible — décrit l'état actuel (as-is) et l'architecture cible (to-be) pour permettre à l'admin de chaque organisation (tenant) de créer ses propres rôles et permissions, et de contrôler dynamiquement l'accès API + l'affichage frontend (menus, boutons, fonctionnalités).
>
> Voir aussi : [datafriday-web/docs/RBAC_SYSTEM.md](../../../datafriday-web/docs/RBAC_SYSTEM.md) (partie frontend) et [auth/MULTI_TENANT.md](MULTI_TENANT.md).

---

## 0. Alignement « Permissions (rôles) » — 2026-06-26 (état courant)

> Cette section **prévaut** sur les §2–§3 historiques (design d'origine). Source de vérité du
> catalogue et des rôles : [`src/core/rbac/permission-catalog.ts`](../../src/core/rbac/permission-catalog.ts).
> Mapping écran ↔ code pour le front : [`docs/HANDOFF_FRONT_RBAC_ROLES.md`](../HANDOFF_FRONT_RBAC_ROLES.md).

**Décisions appliquées :**
- **Rôles système = `ADMIN` + 6 rôles métier.** ADMIN inchangé (bypass, toutes permissions).
  MANAGER/STAFF/VIEWER **retirés** des rôles seedés (l'enum `UserRole` est conservé pour la
  compat des données legacy uniquement). Les 6 rôles métier ont `systemKey = null` et sont
  identifiés par leur `name`.
- **Permissions au niveau écran** (ex. `front.fb.predict`, `front.fb.live`, `back.fb.costTracking`),
  regroupées par catégorie (`Edit Space`, `Edit F&B Menu`, `Edit Events`, `Edit HR`, `Data Integration`,
  `Users`, `Account`…).
- **Enforcement backend** : les écrans front auparavant ouverts sont désormais gardés par
  `@RequirePermissions` (`analyse` → `front.fb.analyse`/`back.fb.costTracking`, `inventory` →
  `front.fb.spaceInventory`, `restock-state` → `front.fb.restock`/`restockBoard`). Les écritures
  `spaces` passent de `@Roles('ADMIN','MANAGER')` à `@RequirePermissions('space.edit')`. Les gates
  `@Roles` redondants sur `users`/`roles`/`permissions` sont supprimés au profit des `@RequirePermissions`
  déjà présents (modèle 100 % piloté par permission).

**Matrice rôle → permissions (défauts seedés, modifiables par l'admin sauf ADMIN) :**

| Rôle | `systemKey` | Permissions |
|---|---|---|
| **ADMIN** | `ADMIN` | toutes (bypass) |
| **Analyste F&B** | `null` | `nav.spaces`, `front.fb.analyse`, `front.fb.eventPredict`, `front.fb.predict`, `front.fb.spaceInventory`, `front.fb.stockUp`, `front.fb.live`, `front.fb.shoppingList`, `back.fb.costTracking`, `back.fb.marginReport` |
| **Logistic F&B** | `null` | `nav.spaces`, `front.fb.spaceInventory`, `front.fb.restock` |
| **Technicien Logistic** | `null` | `nav.spaces`, `front.fb.restockBoard` |
| **PDV Superviseur** | `null` | `nav.spaces`, `front.fb.spaceInventory`, `front.fb.restockBoard` |
| **Achat F&B** | `null` | `nav.spaces`, `menu.fb.suppliers`, `menu.fb.marketPrices`, `front.fb.analyse`, `front.fb.eventPredict`, `front.fb.predict`, `front.fb.spaceInventory`, `front.fb.stockUp`, `front.fb.live`, `front.fb.shoppingList` |
| **Chef** | `null` | `nav.spaces`, `menu.fb.components`, `menu.fb.menuItems`, `menu.fb.spaceMenu` |

**Profils d'administration :** `Super Admin` = plateforme (`User.isSuperAdmin`, `SuperAdminGuard`,
cross-tenant). `Administrateur de site` (gestion users scopée par site) = **lot ultérieur**, non livré ici.

**Déploiement** : pas de migration de schéma (catalogue/rôles sont des données). Exécuter
`npm run rbac:backfill` (catalogue + rôles métier sur tous les tenants + dé-systématisation des anciens
rôles) **avec/avant** le déploiement du code, sinon les rôles métier seraient bloqués sur les écrans
nouvellement gardés. Option `REMAP_LEGACY_TO="<Nom de rôle>"` pour réassigner les users encore sur
MANAGER/STAFF/VIEWER.

---

## 1. Principes directeurs

- **"Super admin" = Admin/Owner du tenant.** Pas de rôle plateforme cross-tenant. Chaque organisation gère ses propres rôles et permissions, exactement comme le suggère l'emplacement actuel des pages `Roles`/`Permissions` sous *Organisation → Accès* dans le frontend.
- **Catalogue de permissions hybride** :
  - un **catalogue système** (seedé, `tenantId = null`, `isSystem = true`) couvrant les fonctionnalités/menus réels de l'application — non supprimable, non renommable ;
  - des **permissions custom par tenant** (`tenantId = <tenant>`, `isSystem = false`) que l'admin peut créer librement (codes/noms libres), utilisées principalement pour l'affichage conditionnel côté frontend (menus, boutons, sections) sans garantie de vérification automatique côté backend.
- **Compatibilité ascendante** : l'enum `UserRole` (ADMIN/MANAGER/STAFF/VIEWER) reste la hiérarchie de sécurité "dure" (suppression d'utilisateurs, changement de rôle, gestion des rôles eux-mêmes...). Les nouveaux rôles dynamiques s'appuient sur cette hiérarchie via un champ `systemKey`.
- **Le rôle ADMIN garde toujours l'intégralité des permissions**, quoi qu'il arrive (bypass codé en dur), pour éviter qu'un admin se verrouille lui-même hors de l'application en modifiant les permissions de son propre rôle.

---

## 2. État actuel (as-is)

### 2.1 Modèle de données actuel

`prisma/schema.prisma` (lignes ~123-335) :

```prisma
enum UserRole {
  ADMIN
  MANAGER
  STAFF
  VIEWER
}

model User {
  id        String   @id @default(cuid())
  email     String
  firstName String
  lastName  String
  fullName  String?
  role      UserRole @default(VIEWER)
  avatar    String?
  tenantId  String
  // ...
}

model UserTenant {
  id       String   @id @default(cuid())
  userId   String
  tenantId String
  role     UserRole @default(ADMIN)
  isOwner  Boolean  @default(false)
  // ...
}

model UserSpaceAccess {
  id      String   @id @default(cuid())
  userId  String
  spaceId String
  role    UserRole @default(VIEWER)
  // ...
}
```

Il n'existe **aucun modèle `Role`, `Permission` ou `RolePermission`** : le RBAC actuel est purement basé sur l'enum `UserRole`.

### 2.2 Auth & Guards actuels

| Élément | Fichier | Rôle |
|---|---|---|
| `JwtDatabaseGuard` | `src/core/auth/guards/jwt-db.guard.ts` | Valide le JWT Supabase, charge `request.user` depuis la DB (cache local 15s → Redis 5min → DB) |
| `RolesGuard` | `src/core/auth/guards/roles.guard.ts` | Lit `@Roles(...)`, vérifie `request.user.role === role` |
| `@Roles(...roles: UserRole[])` | `src/core/auth/decorators/roles.decorator.ts` | Déclare les rôles requis sur un handler |
| `@CurrentUser()` | `src/core/auth/decorators/current-user.decorator.ts` | Retourne `{ id, email, tenantId, role }` |
| `@CurrentTenant()` | `src/core/auth/decorators/current-tenant.decorator.ts` | Retourne le `tenantId` courant |

Les deux guards (`JwtDatabaseGuard`, `RolesGuard`) sont enregistrés **globalement** dans `app.module.ts` via `APP_GUARD`. Tous les contrôleurs sont donc protégés par défaut, sauf `@Public()`.

### 2.3 Endpoints existants

`src/features/users/users.controller.ts` :

| Méthode | Route | Rôles requis | Description |
|---|---|---|---|
| POST | `/users` | ADMIN, MANAGER | Créer un utilisateur |
| GET | `/users` | ADMIN, MANAGER | Lister (pagination, recherche, filtre rôle) |
| GET | `/users/statistics` | ADMIN, MANAGER | Statistiques par rôle |
| GET | `/users/me` | (authentifié) | Profil courant |
| GET | `/users/:id` | ADMIN, MANAGER | Détail |
| PATCH | `/users/:id` | ADMIN, MANAGER | Mise à jour |
| DELETE | `/users/:id` | ADMIN | Suppression (anti self-delete, anti owner) |
| POST | `/users/invite` | ADMIN, MANAGER | Invitation par email |
| PATCH | `/users/:id/role` | ADMIN | Changement de rôle (anti self, anti owner demotion) |
| POST | `/users/:id/spaces/:spaceId/access` | ADMIN, MANAGER | Accès à un space |
| DELETE | `/users/:id/spaces/:spaceId/access` | ADMIN, MANAGER | Révocation accès space |

`src/features/onboarding/onboarding.controller.ts` et `src/features/me/me.controller.ts` exposent `GET /me`, `GET /me/tenant`, `GET /onboarding/status`, etc. (voir [MULTI_TENANT.md](MULTI_TENANT.md)).

### 2.4 Écart constaté (gap analysis)

Le frontend (`src/api/endpoints/role.api.js`, `permission.api.js`) appelle déjà :

```
GET/POST/PATCH/DELETE /roles
GET/POST/PATCH/DELETE /permissions
```

→ **Ces routes n'existent pas côté backend.** Les pages `RoleListView.vue` et `PermissionListView.vue` (déjà développées, sous *Organisation → Accès*) sont actuellement non fonctionnelles. C'est l'écart principal que ce document comble.

---

## 3. Architecture cible

### 3.1 Nouveaux modèles Prisma

Ajout dans `prisma/schema.prisma` (section `// ==================== RBAC ====================`, après `UserSpaceAccess`) :

```prisma
enum PermissionScope {
  SYSTEM // catalogue de base, seedé, partagé par tous les tenants
  CUSTOM // créé par l'admin d'un tenant
}

model Permission {
  id          String          @id @default(cuid())
  tenantId    String?         // null = permission système (catalogue global, lecture seule)
  code        String          // ex: "menu.organisation.roles", "users.invite"
  name        String
  description String?
  category    String?         // regroupement pour l'UI: "Organisation", "F&B", "Events", ...
  scope       PermissionScope @default(CUSTOM)
  isSystem    Boolean         @default(false) // true => non éditable / non supprimable
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  tenant Tenant?           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  roles  RolePermission[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([scope])
}

model Role {
  id          String    @id @default(cuid())
  tenantId    String    // chaque tenant a sa propre copie des rôles (y compris les 4 rôles système)
  name        String
  description String?
  systemKey   UserRole? // ADMIN | MANAGER | STAFF | VIEWER -> hiérarchie de sécurité de base
  isSystem    Boolean   @default(false) // true pour les 4 rôles de base, non supprimables/renommables
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  permissions RolePermission[]
  users       User[]
  userTenants UserTenant[]

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([systemKey])
}

model RolePermission {
  roleId       String
  permissionId String

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId])
}
```

Champs ajoutés sur les modèles existants (transition, voir §3.3) :

```prisma
model User {
  // ... champs existants
  role   UserRole @default(VIEWER) // conservé pour compat descendante
  roleId String?                   // nouveau: FK vers Role (rôle dynamique)
  roleRef Role?   @relation(fields: [roleId], references: [id], onDelete: SetNull)
}

model UserTenant {
  // ... champs existants
  role   UserRole @default(ADMIN) // conservé pour compat descendante
  roleId String?
  roleRef Role? @relation(fields: [roleId], references: [id], onDelete: SetNull)
}
```

> **Pourquoi `Role.tenantId` est obligatoire (pas de rôles "globaux" partagés)** : si les 4 rôles de base (ADMIN/MANAGER/STAFF/VIEWER) étaient partagés entre tenants (`tenantId = null`), modifier les permissions du rôle "MANAGER" d'un tenant impacterait tous les autres tenants. Chaque tenant reçoit donc sa **propre copie** des 4 rôles système à la création (clonage), librement éditable (sauf `name`/`systemKey`/suppression).

### 3.2 Catalogue de permissions système (seed)

Catalogue initial, seedé une fois (`tenantId = null`, `scope = SYSTEM`, `isSystem = true`), reflétant les menus/fonctionnalités réels du frontend (voir détail complet et mapping menu ↔ code dans le [doc frontend](../../../datafriday-web/docs/RBAC_SYSTEM.md#4-catalogue-de-permissions--menus)).

Extrait représentatif :

| code | name | category |
|---|---|---|
| `nav.spaces` | Accès Spaces | Navigation |
| `menu.fb.suppliers` | Fournisseurs F&B | F&B |
| `menu.fb.marketPrices` | Prix du marché | F&B |
| `menu.fb.components` | Composants | F&B |
| `menu.fb.menuItems` | Articles de menu | F&B |
| `menu.fb.spaceMenu` | Menus par espace | F&B |
| `menu.events.manage` | Gestion des événements | Events |
| `menu.config.manage` | Configurations produits | Configuration |
| `menu.integration.fb` | Intégration de données F&B | Intégration |
| `org.users.view` | Voir les utilisateurs | Organisation |
| `org.users.manage` | Gérer les utilisateurs (CRUD, invite) | Organisation |
| `org.users.changeRole` | Changer le rôle d'un utilisateur | Organisation |
| `org.roles.manage` | Gérer les rôles | Organisation |
| `org.permissions.manage` | Gérer les permissions | Organisation |
| `spaces.manage` | Gérer les spaces (CRUD, builder) | Spaces |

Ces permissions sont les **seules garanties d'avoir un effet réel côté backend** lorsqu'elles sont câblées via `@RequirePermissions(...)` (voir §3.5). Les permissions `CUSTOM` créées par un admin de tenant n'ont d'effet que côté frontend (masquage de menus/boutons), sauf si un développeur les câble explicitement.

### 3.3 Stratégie de migration des rôles

1. **Migration Prisma additive** : ajout des modèles `Permission`, `Role`, `RolePermission` + colonnes `roleId` nullable sur `User` et `UserTenant`. Aucun champ existant supprimé → zéro régression immédiate.
2. **Seed** :
   - insérer le catalogue de permissions `SYSTEM` (`tenantId = null`) ;
   - pour **chaque tenant existant**, créer 4 `Role` (`isSystem = true`, `systemKey = ADMIN|MANAGER|STAFF|VIEWER`, `tenantId = <tenant>`) avec un jeu de permissions par défaut (cf. tableau de mapping côté frontend) ;
   - pour chaque `User`/`UserTenant` existant, renseigner `roleId` = id du `Role` correspondant à son `role` (enum) actuel dans son tenant.
3. **Onboarding** (`features/onboarding`) : à la création d'un nouveau tenant, cloner les 4 rôles système + permissions par défaut (même logique que le seed) — voir `onboarding.service.ts`.
4. **Lecture hybride** : tant que la migration n'est pas terminée pour 100% des lignes, le code backend lit `user.roleRef ?? fallback(user.role)` (un rôle "virtuel" calculé à partir de l'enum si `roleId` est `null`).
5. **Dépréciation différée** : les colonnes enum `role` sur `User`/`UserTenant`/`UserSpaceAccess` sont conservées comme **champ dérivé en lecture seule**, recalculé à partir de `Role.systemKey` à chaque écriture (pour ne pas casser les requêtes/exports existants qui filtrent sur `role`). Suppression définitive uniquement dans une migration ultérieure, hors scope de ce document.

### 3.4 API Endpoints à créer

Nouveaux modules `src/features/roles/` et `src/features/permissions/`, suivant exactement le pattern de `src/features/users/` (controller + service + dto + module).

#### `GET /roles`
- Guard : `JwtDatabaseGuard` (tout utilisateur authentifié)
- Retourne les rôles du tenant courant (`tenantId` via `@CurrentTenant()`), avec `permissions` peuplées :
```json
[
  {
    "id": "role_xxx",
    "name": "MANAGER",
    "description": "Gestion opérationnelle",
    "systemKey": "MANAGER",
    "isSystem": true,
    "permissions": [{ "id": "perm_xxx", "code": "org.users.view", "name": "Voir les utilisateurs" }]
  }
]
```

#### `POST /roles`
- `@Roles(UserRole.ADMIN)` (super admin du tenant)
- DTO `CreateRoleDto { name: string; description?: string; permissionIds: string[] }`
- Crée un `Role` (`tenantId` courant, `isSystem = false`, `systemKey = null`) + lignes `RolePermission`
- 409 si `name` déjà utilisé dans le tenant

#### `PATCH /roles/:id`
- `@Roles(UserRole.ADMIN)`
- DTO identique (partiel)
- Règles :
  - 404 si le rôle n'appartient pas au tenant courant
  - si `role.isSystem === true` : `name` et `systemKey` **non modifiables** (400 si tentative) ; `description` et `permissionIds` modifiables
  - si `role.systemKey === 'ADMIN'` : la mise à jour de `permissionIds` est acceptée mais **sans effet sur les vérifications backend** (le rôle ADMIN garde toujours toutes les permissions, cf. §3.6) — utile uniquement si le frontend veut afficher/masquer des éléments pour les admins eux-mêmes

#### `DELETE /roles/:id`
- `@Roles(UserRole.ADMIN)`
- 400 si `role.isSystem === true` (rôles de base non supprimables)
- 409 si des `User`/`UserTenant` référencent encore ce rôle (le client doit d'abord réassigner ces utilisateurs)

#### `GET /permissions`
- Guard : `JwtDatabaseGuard` (tout utilisateur authentifié — nécessaire pour peupler le sélecteur de permissions du formulaire de rôle)
- Retourne `Permission` où `tenantId IS NULL OR tenantId = :tenantId`, triées par `category`

#### `POST /permissions`
- `@Roles(UserRole.ADMIN)`
- DTO `CreatePermissionDto { code: string; name: string; description?: string; category?: string }`
- Crée une permission `CUSTOM` (`tenantId` courant, `isSystem = false`, `scope = CUSTOM`)
- 409 si `code` déjà utilisé dans le tenant (unicité `[tenantId, code]`)

#### `PATCH /permissions/:id` / `DELETE /permissions/:id`
- `@Roles(UserRole.ADMIN)`
- 403/400 si `permission.isSystem === true` (catalogue système en lecture seule)
- `DELETE` : supprime aussi les `RolePermission` associées (cascade)

#### Évolution de `PATCH /users/:id/role`
- DTO `ChangeRoleDto` étendu : accepte `{ roleId: string }` (nouveau, prioritaire) **ou** `{ role: UserRole }` (legacy, conservé pour compat — résolu vers le `Role` système correspondant du tenant)
- Règles existantes conservées : pas de self-change, pas de démotion du owner

### 3.5 Guards & décorateurs

| Élément | Statut | Usage |
|---|---|---|
| `RolesGuard` + `@Roles(UserRole.X)` | **conservé** | Endpoints "hiérarchiques" critiques : suppression d'utilisateurs, gestion des rôles/permissions, changement de rôle. Vérifie `user.role.systemKey ?? user.role` (calculé à la résolution JWT, voir §3.7) |
| `PermissionsGuard` + `@RequirePermissions('code', ...)` | **nouveau** | Endpoints "fonctionnalité" optionnels (ex: export CSV, accès à un module spécifique). `OR` logique entre les codes fournis. `systemKey === 'ADMIN'` → toujours `true` |

```typescript
// src/core/auth/guards/permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (user.role?.systemKey === 'ADMIN') return true; // bypass admin

    const granted: string[] = user.role?.permissions ?? [];
    return required.some((code) => granted.includes(code));
  }
}

// src/core/auth/decorators/permissions.decorator.ts
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
```

`PermissionsGuard` est ajouté **après** `RolesGuard` dans `app.module.ts` (`APP_GUARD`), avec le même comportement permissif par défaut (pas de métadonnée = accès autorisé).

### 3.6 Règle de sécurité clé : ADMIN = toutes permissions

Pour éviter qu'un admin se retire accidentellement (ou retire à tous les ADMIN) l'accès à une fonctionnalité critique en éditant les permissions du rôle système ADMIN :

- **Backend** : `PermissionsGuard` et tout calcul de permissions effectif court-circuitent à `true` dès que `systemKey === 'ADMIN'`, indépendamment du contenu de `RolePermission`.
- **Frontend** : le composable `usePermissions().can()` applique la même règle (cf. doc frontend).
- **UI** : le formulaire de rôle peut afficher la liste de permissions du rôle ADMIN comme "toutes activées, lecture seule" plutôt que de permettre de les décocher (évite la confusion), ou afficher un avertissement explicite si l'admin décoche une permission sur son propre rôle.

### 3.7 Intégration avec le JWT-DB lookup

`src/core/auth/strategies/jwt-db-lookup.strategy.ts` doit charger, en plus des champs actuels (`id, email, firstName, fullName, role, tenantId, tenant{...}`) :

```typescript
const user = await this.prisma.user.findUnique({
  where: { id: payload.sub },
  select: {
    id: true, email: true, firstName: true, fullName: true,
    tenantId: true,
    role: true, // legacy enum, conservé
    roleRef: {
      select: {
        id: true, name: true, systemKey: true, isSystem: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    },
    tenant: { select: { id: true, name: true, slug: true, status: true } },
    userTenants: { where: { tenantId: payload.org_id ?? undefined }, select: { isOwner: true } },
  },
});

request.user = {
  id: user.id,
  email: user.email,
  tenantId: user.tenantId,
  role: {
    id: user.roleRef?.id ?? null,
    name: user.roleRef?.name ?? user.role,
    systemKey: user.roleRef?.systemKey ?? user.role, // fallback legacy
    isSystem: user.roleRef?.isSystem ?? true,
    permissions: user.roleRef?.permissions.map((rp) => rp.permission.code) ?? [],
  },
  isOwner: user.userTenants[0]?.isOwner ?? false,
};
```

> Le **cache (local 15s / Redis 5min)** existant doit être invalidé lorsqu'un rôle ou ses permissions changent (CRUD `/roles`, `/permissions`, ou `PATCH /users/:id/role`). Ajouter un appel d'invalidation de cache (par `userId` et/ou par `tenantId`) dans `RolesService`/`PermissionsService` après chaque mutation, en réutilisant le mécanisme déjà en place dans `jwt-db-lookup.strategy.ts`.

`@CurrentUser()` (`current-user.decorator.ts`) doit voir son interface `CurrentUserData` étendue :

```typescript
export interface CurrentUserRole {
  id: string | null;
  name: string;
  systemKey: 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
  isSystem: boolean;
  permissions: string[];
}

export interface CurrentUserData {
  id: string;
  email: string;
  tenantId: string;
  role: CurrentUserRole;
  isOwner: boolean;
}
```

> ⚠️ Tous les endroits qui font aujourd'hui `user.role === UserRole.ADMIN` (ex: `RolesGuard`, `users.service.ts` pour les protections anti self-delete/owner) doivent être adaptés en `user.role.systemKey === UserRole.ADMIN`.

---

## 4. Plan de migration (phases)

| Phase | Contenu | Risque |
|---|---|---|
| 1 | Migration Prisma additive (`Permission`, `Role`, `RolePermission`, colonnes `roleId` nullable) | Faible — additif uniquement |
| 2 | Script de seed : catalogue `SYSTEM` + 4 rôles clonés par tenant existant + `roleId` rétro-rempli | Moyen — script de données, à tester sur un dump staging |
| 3 | Modules `roles/` et `permissions/` (CRUD), `PermissionsGuard` + `@RequirePermissions` | Faible — nouveau code, n'affecte pas l'existant |
| 4 | Adapter `jwt-db-lookup.strategy.ts`, `@CurrentUser()`, `RolesGuard` (`user.role.systemKey`) + invalidation de cache | **Élevé** — touche l'auth globale, nécessite tests de non-régression complets sur tous les contrôleurs `@Roles(...)` |
| 5 | Adapter `onboarding.service.ts` (clonage des rôles à la création de tenant) | Faible |
| 6 | `PATCH /users/:id/role` accepte `roleId` (legacy `role` conservé) | Faible |
| 7 | (Futur, hors scope) Dépréciation des colonnes enum `role` une fois 100% des clients front migrés | — |

La phase 4 est la plus sensible : prévoir une suite de tests (`*.controller.spec.ts`, `*.service.spec.ts` existants dans `users/`) couvrant chaque combinaison `@Roles(...)` × `systemKey` avant déploiement.

---

## 5. Référence API — résumé

| Méthode | Route | Garde | Notes |
|---|---|---|---|
| GET | `/roles` | Auth | Rôles du tenant + permissions |
| POST | `/roles` | ADMIN | Crée un rôle custom |
| PATCH | `/roles/:id` | ADMIN | `name`/`systemKey` lecture seule si `isSystem` |
| DELETE | `/roles/:id` | ADMIN | 400 si `isSystem`, 409 si utilisé |
| GET | `/permissions` | Auth | Catalogue système + custom du tenant |
| POST | `/permissions` | ADMIN | Crée une permission custom |
| PATCH | `/permissions/:id` | ADMIN | 400 si `isSystem` |
| DELETE | `/permissions/:id` | ADMIN | 400 si `isSystem` |
| PATCH | `/users/:id/role` | ADMIN | Accepte `roleId` (nouveau) ou `role` (legacy) |
