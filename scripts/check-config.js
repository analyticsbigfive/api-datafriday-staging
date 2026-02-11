const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.config.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      spaceId: true,
      data: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  console.log('=== CONFIGURATIONS EN BASE ===');
  console.log('Total trouvées:', configs.length);
  configs.forEach((c, i) => {
    console.log('\n--- Config ' + (i + 1) + ' ---');
    console.log('ID:', c.id);
    console.log('SpaceId:', c.spaceId);
    console.log('Data présent:', c.data !== null);
    if (c.data) {
      const data = typeof c.data === 'string' ? JSON.parse(c.data) : c.data;
      console.log('Nombre de floors:', data.floors?.length || 0);
      if (data.floors) {
        data.floors.forEach(f => {
          console.log('  Floor:', f.id, '-', f.name, '- Elements:', f.elements?.length || 0);
        });
      }
    }
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
