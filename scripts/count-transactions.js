require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function count() {
    const count = await prisma.weezeventTransaction.count({
        where: { tenantId: 'cmj8nq42a000113pfk28ns4fa' }
    });
    
    const sample = await prisma.weezeventTransaction.findMany({
        where: { tenantId: 'cmj8nq42a000113pfk28ns4fa' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
            weezeventId: true,
            amount: true,
            status: true,
            transactionDate: true,
            eventName: true,
            createdAt: true
        }
    });
    
    console.log(`\n📊 Total transactions: ${count}`);
    console.log(`\n🔍 5 dernières transactions:\n`);
    sample.forEach((tx, i) => {
        console.log(`${i+1}. Weezevent ID: ${tx.weezeventId}`);
        console.log(`   Amount: ${tx.amount / 100}€`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Event: ${tx.eventName}`);
        console.log(`   Transaction Date: ${tx.transactionDate}`);
        console.log(`   Synced: ${tx.createdAt}\n`);
    });
    
    await prisma.$disconnect();
}

count().catch(console.error);
