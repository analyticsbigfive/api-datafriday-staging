/**
 * Bootstrap / gestion des super-admins PLATEFORME.
 *
 * Usage :
 *   npx tsx scripts/set-super-admin.ts <email>            # promeut
 *   npx tsx scripts/set-super-admin.ts <email> --revoke   # rétrograde
 *   npx tsx scripts/set-super-admin.ts --list             # liste les super-admins
 *
 * Le flag `isSuperAdmin` n'est pas exposé via l'API par défaut : ce script est le
 * point d'entrée pour désigner le 1er super-admin (ensuite, gestion via UI possible).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const admins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true, email: true, fullName: true },
    });
    console.log(`👑 ${admins.length} super-admin(s) :`);
    admins.forEach((a) => console.log(`   - ${a.email} (${a.id})`));
    return;
  }

  const email = args[0];
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Usage: npx tsx scripts/set-super-admin.ts <email> [--revoke|--list]');
    process.exit(1);
  }

  // Un même email peut exister sur plusieurs tenants (multi-org) : on promeut tous
  // les profils correspondants (le flag est porté par l'utilisateur, pas le tenant).
  const result = await prisma.user.updateMany({
    where: { email },
    data: { isSuperAdmin: !revoke },
  });

  if (result.count === 0) {
    console.error(`❌ Aucun utilisateur avec l'email ${email}`);
    process.exit(1);
  }

  console.log(
    `✅ ${email} ${revoke ? 'rétrogradé' : 'promu super-admin'} (${result.count} profil(s)).`,
  );
  console.log('ℹ️  Invalidez le cache auth (ou attendez 5 min) pour effet immédiat.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
