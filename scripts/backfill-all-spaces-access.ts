/**
 * Backfill du flag `User.allSpacesAccess` après découplage accès-espaces / rôle.
 * Idempotent. DRY-RUN par défaut (--apply pour écrire).
 *
 *   npx tsx scripts/backfill-all-spaces-access.ts
 *   npx tsx scripts/backfill-all-spaces-access.ts --apply
 *
 * Évite toute régression : sous l'ancien modèle, voyaient TOUS les espaces les
 * owners + les rôles ADMIN/MANAGER (via la permission `spaces.viewAll`). On leur
 * pose `allSpacesAccess = true`. Les STAFF/VIEWER (restreints, déjà dotés de leurs
 * UserSpaceAccess par le backfill précédent) restent à `false`. L'owner pourra
 * ensuite restreindre un admin/manager au cas par cas.
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY\n' : '🔍 DRY-RUN (ajoutez --apply)\n');

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, role: true, allSpacesAccess: true,
      roleRef: { select: { systemKey: true } },
      userTenants: { select: { isOwner: true } },
    },
  });

  const toFlag = users.filter((u) => {
    if (u.allSpacesAccess) return false; // déjà OK
    const systemKey = u.roleRef?.systemKey ?? u.role;
    const isOwner = u.userTenants.some((ut) => ut.isOwner);
    return isOwner || systemKey === UserRole.ADMIN || systemKey === UserRole.MANAGER;
  });

  console.log(`Utilisateurs total: ${users.length} — à passer allSpacesAccess=true: ${toFlag.length}`);
  toFlag.forEach((u) => console.log(`   - ${u.email}`));

  if (APPLY && toFlag.length) {
    await prisma.user.updateMany({
      where: { id: { in: toFlag.map((u) => u.id) } },
      data: { allSpacesAccess: true },
    });
    console.log('\n✅ Appliqué. Invalidez le cache auth (ou attendez 5 min).');
  } else if (!APPLY) {
    console.log('\nℹ️  Relancez avec --apply pour exécuter.');
  }
}

main().catch((e) => { console.error('ERREUR', e); process.exit(1); }).finally(() => prisma.$disconnect());
