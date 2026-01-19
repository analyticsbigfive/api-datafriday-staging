require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateStatus() {
    const result = await prisma.tenant.update({
        where: { id: 'cmj8nq42a000113pfk28ns4fa' },
        data: { status: 'ACTIVE' },
        select: { id: true, name: true, status: true }
    });
    
    console.log('\n✅ Tenant mis à jour:');
    console.log(JSON.stringify(result, null, 2));
    
    await prisma.$disconnect();
}

updateStatus().catch(console.error);
