/// <reference types="node" />
/**
 * Backfill RBAC — aligne TOUS les tenants existants sur le catalogue/rôles cible.
 *
 * À exécuter une fois après le déploiement du nouveau catalogue (voir
 * docs/auth/RBAC_SYSTEM.md). Idempotent : ré-exécutable sans effet de bord.
 *
 *   npm run rbac:backfill            # catalogue + rôles métier + dé-systématisation
 *   REMAP_LEGACY_TO="Analyste F&B" npm run rbac:backfill
 *                                    # + réassigne les users encore sur MANAGER/STAFF/VIEWER
 *
 * Ce que fait le script, pour chaque tenant :
 *  1. (global) (ré)insère le catalogue de permissions système (nouveaux codes inclus).
 *  2. clone/ré-synchronise les rôles système cibles : ADMIN + 6 rôles métier.
 *  3. dé-systématise les anciens rôles MANAGER/STAFF/VIEWER (isSystem=false, systemKey=null)
 *     pour qu'un admin puisse les éditer/supprimer — SANS casser les users encore assignés.
 *  4. (optionnel) remap des users encore sur un ancien rôle vers REMAP_LEGACY_TO.
 */
import { PrismaClient } from '@prisma/client';
import { ensureSystemPermissionCatalog, cloneSystemRolesForTenant } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient();

const LEGACY_ROLE_NAMES = ['MANAGER', 'STAFF', 'VIEWER'];

async function main() {
  const remapTo = process.env.REMAP_LEGACY_TO?.trim() || null;
  console.log('🔧 RBAC backfill — début');

  // 1. Catalogue global (idempotent)
  await ensureSystemPermissionCatalog(prisma);
  console.log('✅ Catalogue de permissions système à jour');

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`ℹ️  ${tenants.length} tenant(s) à traiter`);

  let totalLegacyUsers = 0;

  for (const tenant of tenants) {
    // 2. Rôles cibles (ADMIN + rôles métier) — crée les rôles manquants avec leurs
    //    permissions par défaut ; ne réécrit pas les permissions des rôles déjà présents.
    const roleIdByName = await cloneSystemRolesForTenant(prisma, tenant.id);

    // 3. Dé-systématise les anciens rôles génériques restants
    const legacyRoles = await prisma.role.findMany({
      where: { tenantId: tenant.id, name: { in: LEGACY_ROLE_NAMES }, isSystem: true },
      select: { id: true, name: true },
    });

    if (legacyRoles.length > 0) {
      await prisma.role.updateMany({
        where: { id: { in: legacyRoles.map((r) => r.id) } },
        data: { isSystem: false, systemKey: null },
      });
    }

    // Combien de users sont encore assignés à un ancien rôle ?
    const legacyRoleIds = legacyRoles.map((r) => r.id);
    const [usersOnLegacy, userTenantsOnLegacy] = await Promise.all([
      legacyRoleIds.length
        ? prisma.user.count({ where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } } })
        : Promise.resolve(0),
      legacyRoleIds.length
        ? prisma.userTenant.count({ where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } } })
        : Promise.resolve(0),
    ]);
    totalLegacyUsers += usersOnLegacy;

    // 4. Remap optionnel
    if (remapTo && legacyRoleIds.length && (usersOnLegacy > 0 || userTenantsOnLegacy > 0)) {
      const targetRoleId = roleIdByName[remapTo];
      if (!targetRoleId) {
        throw new Error(
          `REMAP_LEGACY_TO="${remapTo}" introuvable parmi les rôles système (${Object.keys(roleIdByName).join(', ')})`,
        );
      }
      await prisma.user.updateMany({
        where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } },
        data: { roleId: targetRoleId },
      });
      await prisma.userTenant.updateMany({
        where: { tenantId: tenant.id, roleId: { in: legacyRoleIds } },
        data: { roleId: targetRoleId },
      });
    }

    const remapNote = remapTo ? ` → remap ${usersOnLegacy} user(s) vers "${remapTo}"` : '';
    console.log(
      `  • ${tenant.name} : rôles cibles OK ; ${legacyRoles.length} ancien(s) rôle(s) dé-systématisé(s) ; ` +
        `${usersOnLegacy} user(s) legacy${remapNote}`,
    );
  }

  if (!remapTo && totalLegacyUsers > 0) {
    console.log(
      `\n⚠️  ${totalLegacyUsers} utilisateur(s) restent sur un ancien rôle (MANAGER/STAFF/VIEWER).\n` +
        `   Réassigne-les via l'admin, ou relance avec REMAP_LEGACY_TO="<Nom du rôle>".`,
    );
  }

  console.log('✅ RBAC backfill — terminé');
}

main()
  .catch((e) => {
    console.error('❌ RBAC backfill — échec', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
