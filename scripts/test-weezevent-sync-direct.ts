/**
 * Script de test direct de la synchronisation Weezevent
 * Note: Ce script nécessite le contexte NestJS complet.
 * Pour tester, lancer l'API et utiliser les endpoints /api/v1/weezevent/sync
 * 
 * Alternative: Utiliser les scripts JS autonomes dans /scripts:
 * - node scripts/count-transactions.js
 * - node scripts/check-tenant-cron-eligibility.js
 * - node scripts/fix-all-weezevent-secrets.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBasicConnection() {
    console.log('🔍 Testing basic Weezevent configuration...\n');

    try {
        // Get tenant with Weezevent enabled
        const tenant = await prisma.tenant.findFirst({
            where: {
                id: 'cmj8nq42a000113pfk28ns4fa',
                weezeventEnabled: true,
            },
            select: {
                id: true,
                name: true,
                status: true,
                weezeventEnabled: true,
                weezeventOrganizationId: true,
                weezeventClientId: true,
                weezeventClientSecret: true,
            }
        });

        if (!tenant) {
            console.error('❌ Tenant not found or Weezevent not enabled');
            return;
        }

        console.log(`✅ Tenant: ${tenant.name}`);
        console.log(`📝 Status: ${tenant.status}`);
        console.log(`📝 Organization ID: ${tenant.weezeventOrganizationId}`);
        console.log(`📝 Client ID: ${tenant.weezeventClientId}`);
        console.log(`🔐 Secret configured: ${!!tenant.weezeventClientSecret}`);
        console.log(`🔐 Secret format valid: ${tenant.weezeventClientSecret?.split(':').length === 3}`);

        // Check sync state
        const syncState = await prisma.weezeventSyncState.findUnique({
            where: {
                tenantId_syncType: {
                    tenantId: tenant.id,
                    syncType: 'transactions',
                }
            }
        });

        console.log(`\n📊 Sync State:`);
        console.log(`- Last synced: ${syncState?.lastSyncedAt || 'Never'}`);
        console.log(`- Total synced: ${syncState?.totalSynced || 0}`);
        console.log(`- Last count: ${syncState?.lastSyncCount || 0}`);
        console.log(`- Last duration: ${syncState?.lastSyncDuration || 0}ms`);

        // Check transaction count
        const txCount = await prisma.weezeventTransaction.count({
            where: { tenantId: tenant.id }
        });

        console.log(`\n📈 Database:`);
        console.log(`- Transactions stored: ${txCount}`);

        // Get sample transaction
        if (txCount > 0) {
            const sample = await prisma.weezeventTransaction.findFirst({
                where: { tenantId: tenant.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    weezeventId: true,
                    amount: true,
                    status: true,
                    transactionDate: true,
                    eventName: true,
                }
            });

            console.log(`\n📄 Sample transaction:`);
            console.log(`- ID: ${sample?.weezeventId}`);
            const amount = sample?.amount ? sample.amount.toNumber() : 0;
            console.log(`- Amount: ${amount / 100}€`);
            console.log(`- Status: ${sample?.status}`);
            console.log(`- Event: ${sample?.eventName}`);
            console.log(`- Date: ${sample?.transactionDate}`);
        }

        console.log(`\n✅ Configuration OK - Ready for CRON sync`);
        console.log(`\n💡 Pour tester la synchro complète:`);
        console.log(`   curl -X POST http://localhost:3000/api/v1/weezevent/sync/transactions`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error('Details:', error.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testBasicConnection();
