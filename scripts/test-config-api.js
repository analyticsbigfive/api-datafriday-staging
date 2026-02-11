const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Test 1: Vérifier les données en base
  console.log('\n=== TEST 1: Données en base ===');
  const config = await prisma.config.findUnique({
    where: { id: 'config-1770743812432' }
  });
  
  console.log('Config existe:', !!config);
  console.log('Data existe:', !!config?.data);
  
  if (config?.data) {
    const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    console.log('Floors:', data.floors?.length || 0);
    if (data.floors && data.floors.length > 0) {
      console.log('Premier floor:', data.floors[0].name);
      console.log('Elements du premier floor:', data.floors[0].elements?.length || 0);
    }
  }
  
  // Test 2: Simuler l'appel API via le service
  console.log('\n=== TEST 2: Simulation appel service ===');
  
  // Chercher le tenantId du space
  const space = await prisma.space.findFirst({
    where: { id: 'space-X1JnWN7z-n' },
    select: { tenantId: true }
  });
  
  console.log('Space tenantId:', space?.tenantId);
  
  // Maintenant récupérer la config comme le ferait le service
  const configWithSpace = await prisma.config.findUnique({
    where: { id: 'config-1770743812432' },
    include: {
      space: {
        select: {
          id: true,
          name: true,
          tenantId: true,
        },
      },
    },
  });
  
  console.log('\nConfig retournée par service:');
  console.log('- id:', configWithSpace?.id);
  console.log('- name:', configWithSpace?.name);
  console.log('- spaceId:', configWithSpace?.spaceId);
  console.log('- data exists:', !!configWithSpace?.data);
  
  if (configWithSpace?.data) {
    console.log('- data type:', typeof configWithSpace.data);
    console.log('- data.floors length:', configWithSpace.data.floors?.length);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
