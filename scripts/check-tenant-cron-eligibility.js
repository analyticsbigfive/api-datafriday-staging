require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const tenant = await prisma.tenant.findFirst({
        where: { id: 'cmj8nq42a000113pfk28ns4fa' },
        select: {
            id: true,
            name: true,
            status: true,
            weezeventEnabled: true,
            weezeventOrganizationId: true,
            weezeventClientId: true,
            weezeventClientSecret: true
        }
    });
    
    console.log('\n📊 Tenant Status:\n');
    console.log(JSON.stringify(tenant, null, 2));
    console.log('\n✅ Checks:');
    console.log(`- weezeventEnabled: ${tenant.weezeventEnabled}`);
    console.log(`- status: ${tenant.status}`);
    console.log(`- weezeventOrganizationId: ${!!tenant.weezeventOrganizationId}`);
    console.log(`- weezeventClientId: ${!!tenant.weezeventClientId}`);
    console.log(`- weezeventClientSecret exists: ${!!tenant.weezeventClientSecret}`);
    
    const isEligible = tenant.weezeventEnabled 
        && tenant.status === 'ACTIVE'
        && tenant.weezeventOrganizationId 
        && tenant.weezeventClientId 
        && tenant.weezeventClientSecret;
    
    console.log(`\n${isEligible ? '✅' : '❌'} Éligible pour CRON: ${isEligible}`);
    
    await prisma.$disconnect();
}

check().catch(console.error);
