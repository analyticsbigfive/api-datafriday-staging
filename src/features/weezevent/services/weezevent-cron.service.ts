import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { SyncTrackerService } from './sync-tracker.service';

@Injectable()
export class WeezeventCronService implements OnModuleInit {
    private readonly logger = new Logger(WeezeventCronService.name);
    private isEnabled = true;

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncService: WeezeventSyncService,
        private readonly syncTracker: SyncTrackerService,
    ) {}

    onModuleInit() {
        // Check if CRON is enabled via env variable
        this.isEnabled = process.env.WEEZEVENT_CRON_ENABLED !== 'false';
        this.logger.log(`Weezevent CRON jobs ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Sync transactions every 15 minutes
     * Only syncs last 2 hours of data to catch recent changes
     */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async syncRecentTransactions(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting recent transactions sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            // Skip if sync already running for this tenant
            if (this.syncTracker.getRunningSyncs(tenant.id).some(s => s.type === 'transactions')) {
                this.logger.warn(`Skipping tenant ${tenant.id} - transactions sync already running`);
                continue;
            }

            try {
                // Sync last 2 hours
                const fromDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
                
                const result = await this.syncService.syncTransactions(tenant.id, {
                    fromDate,
                    full: false,
                });

                this.logger.log(
                    `✅ Tenant ${tenant.id}: synced ${result.itemsSynced} transactions (${result.itemsCreated} new, ${result.itemsUpdated} updated)`,
                );
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id}: transactions sync failed - ${error.message}`,
                );
            }
        }

        this.logger.log('🔄 CRON: Recent transactions sync completed');
    }

    /**
     * Sync events and products daily at 3 AM
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async syncReferenceData(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting daily reference data sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            try {
                // Sync events
                const eventsResult = await this.syncService.syncEvents(tenant.id);
                this.logger.log(
                    `✅ Tenant ${tenant.id}: synced ${eventsResult.itemsSynced} events`,
                );

                // Sync products
                const productsResult = await this.syncService.syncProducts(tenant.id);
                this.logger.log(
                    `✅ Tenant ${tenant.id}: synced ${productsResult.itemsSynced} products`,
                );
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id}: reference data sync failed - ${error.message}`,
                );
            }
        }

        this.logger.log('🔄 CRON: Daily reference data sync completed');
    }

    /**
     * Full historical sync weekly (Sunday at 2 AM)
     * Syncs last 30 days of transactions
     */
    @Cron('0 2 * * 0') // Sunday at 2 AM
    async fullHistoricalSync(): Promise<void> {
        if (!this.isEnabled) return;

        this.logger.log('🔄 CRON: Starting weekly full historical sync...');

        const tenants = await this.getWeezeventEnabledTenants();

        for (const tenant of tenants) {
            try {
                // Sync last 30 days
                const fromDate = new Date();
                fromDate.setDate(fromDate.getDate() - 30);

                const result = await this.syncService.syncTransactions(tenant.id, {
                    fromDate,
                    full: true,
                });

                this.logger.log(
                    `✅ Tenant ${tenant.id}: full sync completed - ${result.itemsSynced} transactions`,
                );
            } catch (error) {
                this.logger.error(
                    `❌ Tenant ${tenant.id}: full sync failed - ${error.message}`,
                );
            }
        }

        this.logger.log('🔄 CRON: Weekly full historical sync completed');
    }

    /**
     * Get all tenants with Weezevent enabled
     */
    private async getWeezeventEnabledTenants() {
        return this.prisma.tenant.findMany({
            where: {
                weezeventEnabled: true,
                weezeventOrganizationId: { not: null },
                weezeventClientId: { not: null },
                weezeventClientSecret: { not: null },
                status: 'ACTIVE',
            },
            select: {
                id: true,
                name: true,
                weezeventOrganizationId: true,
            },
        });
    }

    /**
     * Manual trigger for testing
     */
    async triggerSync(tenantId: string, type: 'transactions' | 'events' | 'products' | 'full'): Promise<any> {
        this.logger.log(`Manual CRON trigger: ${type} for tenant ${tenantId}`);

        switch (type) {
            case 'transactions':
                const fromDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
                return this.syncService.syncTransactions(tenantId, { fromDate });
            case 'events':
                return this.syncService.syncEvents(tenantId);
            case 'products':
                return this.syncService.syncProducts(tenantId);
            case 'full':
                const fullFromDate = new Date();
                fullFromDate.setDate(fullFromDate.getDate() - 30);
                return this.syncService.syncTransactions(tenantId, { fromDate: fullFromDate, full: true });
        }
    }
}
