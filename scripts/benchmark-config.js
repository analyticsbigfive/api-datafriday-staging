const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function benchmark() {
  const configId = 'config-1770743812432';
  
  console.log('🔄 Benchmark getConfiguration optimized query...\n');
  
  // Test optimized query (select only needed fields)
  const start1 = Date.now();
  const config1 = await prisma.config.findUnique({
    where: { id: configId },
    include: {
      space: {
        select: { id: true, name: true, tenantId: true },
      },
      floors: {
        include: {
          elements: {
            select: {
              id: true, floorId: true, name: true, type: true,
              x: true, y: true, width: true, height: true, depth: true,
              height3d: true, rotation: true, attributes: true,
              cornerRadiusTL: true, cornerRadiusTR: true,
              cornerRadiusBL: true, cornerRadiusBR: true,
              shopTypes: true, storageTypes: true,
              performance: { select: { id: true, revenue: true } },
            },
          },
        },
        orderBy: { level: 'asc' },
      },
    },
  });
  const time1 = Date.now() - start1;
  console.log(`✅ Optimized query: ${time1}ms`);
  console.log(`   Elements: ${config1?.floors?.flatMap(f => f.elements).length}`);
  
  // Test heavy query (include all relations)
  const start2 = Date.now();
  const config2 = await prisma.config.findUnique({
    where: { id: configId },
    include: {
      space: true,
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
      forecourt: {
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
  const time2 = Date.now() - start2;
  console.log(`⚠️  Heavy query: ${time2}ms`);
  
  // Test JSON only (fastest)
  const start3 = Date.now();
  const config3 = await prisma.config.findUnique({
    where: { id: configId },
    select: {
      id: true, name: true, spaceId: true, capacity: true, data: true,
      space: { select: { tenantId: true } },
    },
  });
  const time3 = Date.now() - start3;
  console.log(`🚀 JSON-only query: ${time3}ms`);
  
  console.log('\n📊 Summary:');
  console.log(`   JSON-only: ${time3}ms (baseline)`);
  console.log(`   Optimized: ${time1}ms (+${time1-time3}ms)`);
  console.log(`   Heavy: ${time2}ms (+${time2-time3}ms)`);
}

benchmark()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
