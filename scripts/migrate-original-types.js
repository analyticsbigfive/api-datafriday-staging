/**
 * Script de migration pour synchroniser originalType depuis JSON vers les tables FloorElement
 * Cela permet d'utiliser les tables normalisées comme source unique de vérité
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateOriginalTypes() {
  console.log('🔄 Migration des originalType depuis JSON vers FloorElement...\n');
  
  // Récupérer toutes les configs avec leurs floors et elements
  const configs = await prisma.config.findMany({
    include: {
      floors: {
        include: {
          elements: true,
        },
      },
    },
  });
  
  let totalUpdated = 0;
  
  for (const config of configs) {
    const jsonData = config.data;
    if (!jsonData?.floors) continue;
    
    console.log(`📁 Config: ${config.id}`);
    
    // Créer un map id -> type depuis le JSON
    const jsonTypeMap = new Map();
    for (const floor of jsonData.floors) {
      for (const element of (floor.elements || [])) {
        if (element.id && element.type) {
          jsonTypeMap.set(element.id, element.type);
        }
      }
    }
    
    // Mettre à jour les elements dans les tables
    for (const floor of config.floors) {
      for (const element of (floor.elements || [])) {
        const originalType = jsonTypeMap.get(element.id);
        
        if (originalType && !(element.attributes?.originalType)) {
          // Mettre à jour avec originalType
          await prisma.floorElement.update({
            where: { id: element.id },
            data: {
              attributes: {
                ...(element.attributes || {}),
                originalType: originalType,
              },
            },
          });
          console.log(`  ✅ ${element.id.slice(-15)}: ${element.type} → originalType: ${originalType}`);
          totalUpdated++;
        }
      }
    }
  }
  
  console.log(`\n✨ Migration terminée: ${totalUpdated} elements mis à jour`);
}

migrateOriginalTypes()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
