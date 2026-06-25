/**
 * Backfill Phase 2 (accès par espace). Idempotent. DRY-RUN par défaut.
 *
 *   npx tsx scripts/backfill-space-access.ts            # aperçu (ne modifie rien)
 *   npx tsx scripts/backfill-space-access.ts --apply    # applique
 *
 * Deux actions :
 *  1) Ajoute la permission `spaces.viewAll` aux rôles ADMIN + MANAGER de TOUS les tenants
 *     (le clone système ne re-synchronise pas les permissions des rôles déjà créés).
 *  2) Accorde aux utilisateurs SANS accès complet (ni super-admin, ni systemKey ADMIN,
 *     ni permission `spaces.viewAll`) l'accès à TOUS les espaces actuels de leur tenant,
 *     pour qu'ils ne perdent pas l'accès au moment de l'activation du filtrage.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { ensureSystemPermissionCatalog, SYSTEM_PERMISSIONS } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');
const VIEW_ALL = 'spaces.viewAll';

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY — écritures réelles\n' : '🔍 DRY-RUN — aucune écriture (ajoutez --apply)\n');

  // Garde-fou : la permission doit exister dans le catalogue source.
  if (!SYSTEM_PERMISSIONS.some((p) => p.code === VIEW_ALL)) {
    throw new Error(`Permission ${VIEW_ALL} absente du catalogue — annulé.`);
  }

  // ---- 1) Permission spaces.viewAll sur les rôles ADMIN/MANAGER ----
  let permId: string | undefined;
  if (APPLY) {
    const idByCode = await ensureSystemPermissionCatalog(prisma);
    permId = idByCode[VIEW_ALL];
  } else {
    permId = (await prisma.permission.findFirst({ where: { tenantId: null, code: VIEW_ALL }, select: { id: true } }))?.id;
  }

  const targetRoles = await prisma.role.findMany({
    where: { systemKey: { in: [UserRole.ADMIN, UserRole.MANAGER] } },
    select: { id: true, systemKey: true },
  });

  let rolesAdded = 0;
  for (const r of targetRoles) {
    const already = permId
      ? await prisma.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: r.id, permissionId: permId } }, select: { roleId: true } })
      : null;
    if (already) continue;
    rolesAdded++;
    if (APPLY && permId) {
      await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: permId } });
    }
  }
  console.log(`1) Rôles ADMIN/MANAGER ciblés: ${targetRoles.length} — à compléter avec ${VIEW_ALL}: ${rolesAdded}`);

  // ---- 2) Accès espaces pour les utilisateurs restreints ----
  const users = await prisma.user.findMany({
    select: {
      id: true, tenantId: true, isSuperAdmin: true, role: true,
      roleRef: { select: { systemKey: true, permissions: { select: { permission: { select: { code: true } } } } } },
    },
  });

  let grants = 0;
  let restrictedUsers = 0;
  for (const u of users) {
    const systemKey = u.roleRef?.systemKey ?? u.role;
    const perms = u.roleRef?.permissions.map((rp) => rp.permission.code) ?? [];
    const fullAccess = u.isSuperAdmin || systemKey === UserRole.ADMIN || perms.includes(VIEW_ALL);
    if (fullAccess) continue;
    restrictedUsers++;

    const spaces = await prisma.space.findMany({ where: { tenantId: u.tenantId }, select: { id: true } });
    for (const s of spaces) {
      const exists = await prisma.userSpaceAccess.findUnique({
        where: { userId_spaceId: { userId: u.id, spaceId: s.id } }, select: { spaceId: true },
      });
      if (exists) continue;
      grants++;
      if (APPLY) {
        await prisma.userSpaceAccess.create({ data: { userId: u.id, spaceId: s.id, role: systemKey ?? UserRole.VIEWER } });
      }
    }
  }
  console.log(`2) Utilisateurs restreints: ${restrictedUsers} — accès espaces à créer: ${grants}`);

  console.log(`\n${APPLY ? '✅ Backfill appliqué.' : 'ℹ️  Relancez avec --apply pour exécuter.'}`);
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
