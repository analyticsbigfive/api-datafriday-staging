const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Vérifier une config existante
  const configId = 'config-1770743812432';
  
  const config = await prisma.config.findUnique({
    where: { id: configId },
    include: {
      floors: {
        include: {
          elements: true,
        },
      },
    },
  });
  
  console.log('=== CONFIG:', configId, '===\n');
  
  // Données dans les TABLES
  console.log('📊 TABLES NORMALISÉES:');
  console.log('  Floors dans Table Floor:', config?.floors?.length || 0);
  const tableElements = config?.floors?.flatMap(f => f.elements) || [];
  console.log('  Elements dans Table FloorElement:', tableElements.length);
  if (tableElements[0]) {
    console.log('  Premier element (TABLE):', {
      id: tableElements[0].id.slice(-15),
      type: tableElements[0].type,
      width: tableElements[0].width,
      height: tableElements[0].height,
      hasOriginalType: !!(tableElements[0].attributes?.originalType)
    });
  }
  
  // Données dans le JSON blob
  console.log('\n📦 JSON BLOB (Config.data):');
  const jsonData = config?.data;
  console.log('  Floors dans JSON:', jsonData?.floors?.length || 0);
  const jsonElements = jsonData?.floors?.flatMap(f => f.elements) || [];
  console.log('  Elements dans JSON:', jsonElements.length);
  if (jsonElements[0]) {
    console.log('  Premier element (JSON):', {
      id: jsonElements[0].id?.slice(-15),
      type: jsonElements[0].type,
      width: jsonElements[0].width,
      height: jsonElements[0].height
    });
  }
  
  // Conclusion
  console.log('\n🔍 ANALYSE:');
  const hasOriginalTypeInTable = tableElements.some(el => el.attributes?.originalType);
  console.log('  Elements ont originalType dans attributes:', hasOriginalTypeInTable);
  console.log('  → getConfiguration() utilisera:', hasOriginalTypeInTable ? 'TABLES' : 'JSON');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
