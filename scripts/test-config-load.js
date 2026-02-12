const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.config.findUnique({
    where: { id: 'config-1770743812432' },
    include: {
      floors: {
        include: {
          elements: {
            include: {
              performance: true,
              staffPositions: true,
              inventoryItems: true,
            },
          },
        },
      },
    },
  });
  
  const hasNormalizedFloors = config?.floors?.some(f => f.elements && f.elements.length > 0);
  console.log('Has normalized floors with elements:', hasNormalizedFloors);
  
  if (hasNormalizedFloors && config.floors[0]?.elements[0]) {
    const el = config.floors[0].elements[0];
    console.log('First element from TABLE:', { 
      id: el.id?.slice(-10), 
      type: el.type,
      width: el.width, 
      height: el.height,
      attributes: el.attributes
    });
  }
  
  const jsonData = config?.data;
  if (jsonData?.floors?.[0]?.elements?.[0]) {
    const el = jsonData.floors[0].elements[0];
    console.log('First element from JSON:', { 
      id: el.id?.slice(-10), 
      type: el.type,
      width: el.width, 
      height: el.height
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
