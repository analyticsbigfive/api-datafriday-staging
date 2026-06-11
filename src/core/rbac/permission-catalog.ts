import { Prisma, PermissionScope, UserRole } from '@prisma/client';

/**
 * Catalogue de permissions système (RBAC).
 *
 * Source de vérité unique, partagée par :
 * - `prisma/seed.ts` (catalogue global + rôles des tenants existants)
 * - `OnboardingService` (clonage des rôles système pour un nouveau tenant)
 *
 * Voir docs/auth/RBAC_SYSTEM.md §3.2 et datafriday-web/docs/RBAC_SYSTEM.md §4
 * pour le mapping complet menu ↔ permission ↔ rôle par défaut.
 */
export interface PermissionDefinition {
  code: string;
  name: string;
  description?: string;
  category: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // Navigation
  { code: 'nav.spaces', name: 'Accès Spaces', category: 'Navigation', description: 'Accès au menu Spaces' },
  { code: 'nav.analytics.fb', name: 'Analytiques F&B', category: 'Navigation' },
  { code: 'nav.analytics.hospitality', name: 'Analytiques Hospitality', category: 'Navigation' },
  { code: 'nav.analytics.merch', name: 'Analytiques Merch', category: 'Navigation' },
  { code: 'nav.analytics.ticketing', name: 'Analytiques Ticketing', category: 'Navigation' },
  { code: 'nav.analytics.storage', name: 'Analytiques Storage', category: 'Navigation' },

  // F&B
  { code: 'menu.fb.suppliers', name: 'Fournisseurs F&B', category: 'F&B' },
  { code: 'menu.fb.marketPrices', name: 'Prix du marché', category: 'F&B' },
  { code: 'menu.fb.components', name: 'Composants', category: 'F&B' },
  { code: 'menu.fb.menuItems', name: 'Articles de menu', category: 'F&B' },
  { code: 'menu.fb.spaceMenu', name: 'Menus par espace', category: 'F&B' },

  // Events
  { code: 'menu.events.manage', name: 'Gestion des événements', category: 'Events' },

  // Configuration
  { code: 'menu.config.manage', name: 'Configurations produits', category: 'Configuration' },

  // Intégration
  { code: 'menu.integration.fb', name: 'Intégration de données F&B', category: 'Intégration' },

  // Organisation
  { code: 'org.users.view', name: 'Voir les utilisateurs', category: 'Organisation' },
  { code: 'org.users.manage', name: 'Gérer les utilisateurs', category: 'Organisation' },
  { code: 'org.users.changeRole', name: "Changer le rôle d'un utilisateur", category: 'Organisation' },
  { code: 'org.roles.manage', name: 'Gérer les rôles', category: 'Organisation' },
  { code: 'org.permissions.manage', name: 'Gérer les permissions', category: 'Organisation' },
];

const ALL_CODES = SYSTEM_PERMISSIONS.map((p) => p.code);

export interface SystemRoleDefinition {
  systemKey: UserRole;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    systemKey: UserRole.ADMIN,
    name: 'ADMIN',
    description:
      "Accès complet à l'organisation : toutes les fonctionnalités, gestion des utilisateurs, des rôles et des permissions.",
    // ADMIN possède toujours toutes les permissions (cf. RBAC_SYSTEM.md §3.6)
    permissions: ALL_CODES,
  },
  {
    systemKey: UserRole.MANAGER,
    name: 'MANAGER',
    description:
      "Gestion opérationnelle : F&B, événements, configuration, intégrations et utilisateurs (hors rôles/permissions).",
    permissions: [
      'nav.spaces',
      'nav.analytics.fb',
      'nav.analytics.hospitality',
      'nav.analytics.merch',
      'nav.analytics.ticketing',
      'nav.analytics.storage',
      'menu.fb.suppliers',
      'menu.fb.marketPrices',
      'menu.fb.components',
      'menu.fb.menuItems',
      'menu.fb.spaceMenu',
      'menu.events.manage',
      'menu.config.manage',
      'menu.integration.fb',
      'org.users.view',
      'org.users.manage',
    ],
  },
  {
    systemKey: UserRole.STAFF,
    name: 'STAFF',
    description: 'Accès opérationnel quotidien : spaces, analytiques et menus F&B.',
    permissions: [
      'nav.spaces',
      'nav.analytics.fb',
      'nav.analytics.hospitality',
      'nav.analytics.merch',
      'nav.analytics.ticketing',
      'nav.analytics.storage',
      'menu.fb.suppliers',
      'menu.fb.marketPrices',
      'menu.fb.menuItems',
      'menu.fb.spaceMenu',
    ],
  },
  {
    systemKey: UserRole.VIEWER,
    name: 'VIEWER',
    description: 'Accès en lecture seule aux spaces et aux analytiques.',
    permissions: [
      'nav.spaces',
      'nav.analytics.fb',
      'nav.analytics.hospitality',
      'nav.analytics.merch',
      'nav.analytics.ticketing',
      'nav.analytics.storage',
    ],
  },
];

type RbacClient = Pick<Prisma.TransactionClient, 'permission' | 'role'>;

/**
 * Insère/à jour le catalogue de permissions système (`tenantId = null`, `isSystem = true`).
 * Idempotent — peut être appelé à chaque seed/onboarding sans dupliquer les lignes.
 *
 * Retourne une map `code -> permissionId` pour faciliter le clonage des rôles.
 */
export async function ensureSystemPermissionCatalog(prisma: RbacClient): Promise<Record<string, string>> {
  const permissionIdByCode: Record<string, string> = {};

  for (const perm of SYSTEM_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { tenantId_code: { tenantId: null, code: perm.code } },
      update: {
        name: perm.name,
        description: perm.description,
        category: perm.category,
      },
      create: {
        tenantId: null,
        code: perm.code,
        name: perm.name,
        description: perm.description,
        category: perm.category,
        scope: PermissionScope.SYSTEM,
        isSystem: true,
      },
    });

    permissionIdByCode[perm.code] = permission.id;
  }

  return permissionIdByCode;
}

/**
 * Clone les 4 rôles système (ADMIN/MANAGER/STAFF/VIEWER) pour un tenant, avec
 * leur jeu de permissions par défaut (cf. tableau §4 du doc frontend).
 * Idempotent (upsert sur `[tenantId, name]`).
 *
 * Retourne une map `UserRole -> roleId` pour faciliter le backfill `roleId`.
 */
export async function cloneSystemRolesForTenant(
  prisma: RbacClient,
  tenantId: string,
): Promise<Record<UserRole, string>> {
  const permissionIdByCode = await ensureSystemPermissionCatalog(prisma);
  const roleIdBySystemKey = {} as Record<UserRole, string>;

  for (const roleDef of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { tenantId, name: roleDef.name },
      select: { id: true },
    });

    const permissionIds = roleDef.permissions
      .map((code) => permissionIdByCode[code])
      .filter((id): id is string => Boolean(id));

    let roleId: string;

    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          description: roleDef.description,
          systemKey: roleDef.systemKey,
          isSystem: true,
        },
      });
      roleId = existing.id;
    } else {
      const created = await prisma.role.create({
        data: {
          tenantId,
          name: roleDef.name,
          description: roleDef.description,
          systemKey: roleDef.systemKey,
          isSystem: true,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
      });
      roleId = created.id;
    }

    roleIdBySystemKey[roleDef.systemKey] = roleId;
  }

  return roleIdBySystemKey;
}
