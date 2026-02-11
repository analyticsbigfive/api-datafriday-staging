const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.config.findUnique({
    where: { id: 'config-1770743812432' }
  });
  
  console.log('=== CONFIGURATION COMPLÈTE ===');
  console.log(JSON.stringify(config, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
