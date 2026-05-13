import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';
import {
    WeezeventTransaction as ApiTransaction,
    WeezeventWallet as ApiWallet,
    WeezeventUser as ApiUser,
    WeezeventEvent as ApiEvent,
    WeezeventProduct as ApiProduct,
} from '../interfaces/weezevent-entities.interface';

export interface SyncResult {
    type: string;
    success: boolean;
    itemsSynced: number;
    itemsCreated: number;
    itemsUpdated: number;
    errors: number;
    duration: number; // ms
    fromDate?: Date;
    toDate?: Date;
}

export interface SyncTransactionsOptions {
    fromDate?: Date;
    toDate?: Date;
    full?: boolean; // Full sync vs incremental
    eventId?: number;
}

@Injectable()
export class WeezeventSyncService {
    private readonly logger = new Logger(WeezeventSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) { }

    /**
     * Sync transactions from Weezevent API to database
     */
    async syncTransactions(
        tenantId: string,
        integrationId: string,
        options?: SyncTransactionsOptions,
    ): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'transactions',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
            fromDate: options?.fromDate,
            toDate: options?.toDate,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, enabled: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
            }
            if (!integration.enabled) {
                throw new Error(`Weezevent integration ${integrationId} is disabled`);
            }
            if (!integration.organizationId) {
                throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(
                `Starting transaction sync for tenant ${tenantId}, organization ${organizationId}`,
            );

            // Build weezeventId → CUID map once for the whole sync to resolve
            // TransactionItem.productId from row.item_id (Weezevent numeric ID).
            const allProducts = await this.prisma.weezeventProduct.findMany({
                where: { tenantId, integrationId },
                select: { id: true, weezeventId: true },
            });
            const productIdMap = new Map(allProducts.map(p => [p.weezeventId, p.id]));
            this.logger.log(`Built productIdMap with ${productIdMap.size} entries`);

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                // Fetch transactions from API
                const response = await this.weezeventClient.getTransactions(
                    tenantId,
                    organizationId,
                    {
                        page,
                        perPage: 100,
                        fromDate: options?.fromDate,
                        toDate: options?.toDate,
                        eventId: options?.eventId,
                    },
                );

                this.logger.debug(
                    `Fetched ${response.data.length} transactions (page ${page}/${response.meta.total_pages})`,
                );

                // Sync each transaction
                for (const apiTransaction of response.data) {
                    try {
                        const { created, updated } = await this.syncTransaction(
                            tenantId,
                            integrationId,
                            apiTransaction,
                            productIdMap,
                        );

                        result.itemsSynced++;
                        if (created) result.itemsCreated++;
                        if (updated) result.itemsUpdated++;
                    } catch (error) {
                        this.logger.error(
                            `Failed to sync transaction ${apiTransaction.id}`,
                            (error as Error).stack,
                        );
                        result.errors++;
                    }
                }

                // Check if there are more pages
                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `Transaction sync completed: ${result.itemsSynced} synced (${result.itemsCreated} created, ${result.itemsUpdated} updated), ${result.errors} errors in ${result.duration}ms`,
            );

            // Backfill WeezeventLocation from ALL transactions in DB for this tenant.
            // Runs every sync — safe (idempotent upserts). Ensures locations are visible
            // in the UI even when data was imported before this feature was added.
            await this.backfillLocationsFromTransactions(tenantId, integrationId);

            return result;
        } catch (error) {
            this.logger.error('Transaction sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync a single transaction by ID (for webhooks)
     */
    async syncSingleTransaction(
        tenantId: string,
        integrationId: string,
        transactionId: string | number,
    ): Promise<{ created: boolean; updated: boolean }> {
        this.logger.log(`Syncing single transaction ${transactionId} for tenant ${tenantId}`);

        const integration = await this.prisma.weezeventIntegration.findUnique({
            where: { id: integrationId },
            select: { id: true, organizationId: true, tenantId: true },
        });
        if (!integration || integration.tenantId !== tenantId) {
            throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
        }
        if (!integration.organizationId) {
            throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
        }
        const organizationId = integration.organizationId;

        // Fetch transaction from Weezevent API
        const apiTransaction = await this.weezeventClient.getTransaction(
            tenantId,
            organizationId,
            transactionId.toString(),
        );

        // Sync the transaction
        return this.syncTransaction(tenantId, integrationId, apiTransaction);
    }

    /**
     * Backfill WeezeventLocation from existing WeezeventTransaction rows.
     * Extracts distinct (location_id, locationName) from rawData JSON.
     * Safe to run multiple times — all upserts are idempotent.
     */
    private async backfillLocationsFromTransactions(tenantId: string, integrationId: string): Promise<void> {
        type Row = { wid: string; name: string };
        const rows = await this.prisma.$queryRaw<Row[]>`
            SELECT DISTINCT
                (t."rawData"->>'location_id') AS wid,
                t."locationName"              AS name
            FROM "WeezeventTransaction" t
            WHERE t."tenantId"             = ${tenantId}
              AND t."integrationId"        = ${integrationId}
              AND (t."rawData"->>'location_id') IS NOT NULL
              AND t."locationName"         IS NOT NULL
        `;

        let count = 0;
        for (const row of rows) {
            if (!row.wid || !row.name) continue;
            await this.prisma.weezeventLocation.upsert({
                where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: row.wid } },
                create: {
                    weezeventId: row.wid,
                    tenantId,
                    integrationId,
                    name: row.name,
                    rawData: {},
                    syncedAt: new Date(),
                },
                update: {
                    name: row.name,
                    syncedAt: new Date(),
                },
            });
            count++;
        }

        if (count > 0) {
            this.logger.log(`Backfilled ${count} location(s) for tenant ${tenantId}`);
        }
    }

    /**
     * Sync a single transaction
     */
    private async syncTransaction(
        tenantId: string,
        integrationId: string,
        apiTransaction: ApiTransaction,
        productIdMap: Map<string, string> = new Map(),
    ): Promise<{ created: boolean; updated: boolean }> {
        const weezeventId = apiTransaction.id.toString();

        // Check if transaction exists
        const existing = await this.prisma.weezeventTransaction.findUnique({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
        });

        // Calculate total amount from rows[].payments[].amount (in centimes) → convert to euros
        const txRows = apiTransaction.rows ?? [];
        const totalAmount = txRows.reduce((sum, row) => {
            return sum + (row.payments ?? []).reduce(
                (rowSum, payment) => rowSum + (payment.amount ?? 0),
                0,
            );
        }, 0) / 100;

        // Extract status as string (API may return object with name/title)
        const transactionStatus = apiTransaction.status as any;
        const statusValue = typeof transactionStatus === 'object' && transactionStatus?.name 
            ? transactionStatus.name 
            : (typeof transactionStatus === 'string' ? transactionStatus : 'unknown');

        // Parse transaction date - try multiple sources including rawData
        const rawTx = apiTransaction as any;
        const dateStr = rawTx.created || rawTx.updated || rawTx.validated || rawTx.date || rawTx.created_at;
        
        if (!dateStr) {
            this.logger.warn(`Transaction ${weezeventId} has no date field. Keys: ${Object.keys(rawTx).join(', ')}`);
        }
        
        const transactionDate = dateStr ? new Date(dateStr) : new Date();

        // Upsert location — extracts location from transaction data so the
        // mapping wizard (WeezeventLocation → Space) can be used after sync.
        let locationDbId: string | null = null;
        const locationWeezeventId = rawTx.location_id?.toString() ?? null;
        const locationName = apiTransaction.location_name ?? rawTx.location_name ?? null;
        if (locationWeezeventId && locationName) {
            const loc = await this.prisma.weezeventLocation.upsert({
                where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: locationWeezeventId } },
                create: {
                    weezeventId: locationWeezeventId,
                    tenantId,
                    integrationId,
                    name: locationName,
                    rawData: {},
                    syncedAt: new Date(),
                },
                update: {
                    name: locationName,
                    syncedAt: new Date(),
                },
                select: { id: true },
            });
            locationDbId = loc.id;
        }

        // Upsert transaction
        const transaction = await this.prisma.weezeventTransaction.upsert({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
            create: {
                weezeventId,
                tenantId,
                integrationId,
                amount: totalAmount,
                status: statusValue,
                transactionDate,
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                locationId: locationDbId,
                sellerId: apiTransaction.seller_id?.toString(),
                sellerWalletId: apiTransaction.seller_wallet_id?.toString(),
                rawData: apiTransaction as any,
                syncedAt: new Date(),
            },
            update: {
                amount: totalAmount,
                status: statusValue,
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                locationId: locationDbId,
                rawData: apiTransaction as any,
                syncedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Sync transaction items
        await this.syncTransactionItems(transaction.id, apiTransaction.rows, productIdMap);

        return {
            created: !existing,
            updated: !!existing,
        };
    }

    /**
     * Sync transaction items and payments - OPTIMIZED with batch operations
     */
    private async syncTransactionItems(
        transactionId: string,
        rows: ApiTransaction['rows'],
        productIdMap: Map<string, string> = new Map(),
    ): Promise<void> {
        // Delete existing items (cascade will delete payments)
        await this.prisma.weezeventTransactionItem.deleteMany({
            where: { transactionId },
        });

        // Batch create items and collect payments data
        const itemsData = (rows ?? []).map(row => {
            // Total quantity = sum of all payment quantities for this row
            const totalQty = (row.payments ?? []).reduce((s: number, p: any) => s + (p.quantity ?? 0), 0);
            return {
                transactionId,
                weezeventItemId: row.id.toString(),
                productName: (row as any).item_name || `Item ${row.item_id}`,
                productId: productIdMap.get(String(row.item_id)) ?? null,
                compoundId: row.compound_id?.toString() || null,
                quantity: totalQty || 1,
                unitPrice: (row.unit_price || 0) / 100,
                vat: row.vat || 0,
                reduction: row.reduction || 0,
                rawData: row as any,
            };
        });

        // Create all items in batch
        await this.prisma.weezeventTransactionItem.createMany({
            data: itemsData,
        });

        // Get created items to link payments
        const createdItems = await this.prisma.weezeventTransactionItem.findMany({
            where: { transactionId },
            select: { id: true, weezeventItemId: true },
        });

        // Build item ID map for quick lookup
        const itemIdMap = new Map(createdItems.map(item => [item.weezeventItemId, item.id]));

        // Collect all payments data
        const paymentsData: any[] = [];
        for (const row of rows) {
            const itemId = itemIdMap.get(row.id.toString());
            if (!itemId || !row.payments) continue;

            for (const payment of row.payments) {
                paymentsData.push({
                    itemId,
                    weezeventPaymentId: payment.id?.toString() || null,
                    walletId: payment.wallet_id?.toString() || null,
                    amount: (payment.amount || 0) / 100,
                    amountVat: (payment.amount_vat || 0) / 100,
                    currencyId: payment.currency_id?.toString() || null,
                    quantity: payment.quantity || 1,
                    paymentMethodId: payment.payment_method_id?.toString() || null,
                    rawData: payment as any,
                });
            }
        }

        // Batch create all payments
        if (paymentsData.length > 0) {
            await this.prisma.weezeventPayment.createMany({
                data: paymentsData,
            });
        }
    }

    /**
     * Sync a single wallet
     */
    async syncWallet(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        walletId: string,
    ): Promise<any> {
        this.logger.log(`Syncing wallet ${walletId} for tenant ${tenantId}`);

        const apiWallet = await this.weezeventClient.getWallet(
            tenantId,
            organizationId,
            walletId,
        );

        const weezeventId = apiWallet.id.toString();

        // Extract status as string (API may return object with name/title)
        const walletStatus = apiWallet.status as any;
        const walletStatusValue = typeof walletStatus === 'object' && walletStatus?.name 
            ? walletStatus.name 
            : (typeof walletStatus === 'string' ? walletStatus : 'unknown');

        return this.prisma.weezeventWallet.upsert({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
            create: {
                weezeventId,
                tenantId,
                integrationId,
                balance: apiWallet.balance,
                currency: 'EUR', // Default
                userId: apiWallet.user_id?.toString(),
                walletGroupId: apiWallet.wallet_group_id?.toString(),
                status: walletStatusValue,
                cardNumber: apiWallet.metadata?.card_number,
                cardType: apiWallet.metadata?.card_type,
                rawData: apiWallet as any,
                syncedAt: new Date(),
            },
            update: {
                balance: apiWallet.balance,
                status: walletStatusValue,
                cardNumber: apiWallet.metadata?.card_number,
                cardType: apiWallet.metadata?.card_type,
                rawData: apiWallet as any,
                syncedAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Sync a single user
     */
    async syncUser(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        userId: string,
    ): Promise<any> {
        this.logger.log(`Syncing user ${userId} for tenant ${tenantId}`);

        const apiUser = await this.weezeventClient.getUser(
            tenantId,
            organizationId,
            userId,
        );

        const weezeventId = apiUser.id.toString();

        return this.prisma.weezeventUser.upsert({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
            create: {
                weezeventId,
                tenantId,
                integrationId,
                email: apiUser.email,
                firstName: apiUser.first_name,
                lastName: apiUser.last_name,
                phone: apiUser.phone,
                birthdate: apiUser.birthdate ? new Date(apiUser.birthdate) : null,
                address: apiUser.address,
                walletId: apiUser.wallet_id?.toString(),
                gdprConsent: apiUser.metadata?.gdpr_consent || false,
                marketingConsent: apiUser.metadata?.marketing_consent || false,
                rawData: apiUser as any,
                syncedAt: new Date(),
            },
            update: {
                email: apiUser.email,
                firstName: apiUser.first_name,
                lastName: apiUser.last_name,
                phone: apiUser.phone,
                birthdate: apiUser.birthdate ? new Date(apiUser.birthdate) : null,
                address: apiUser.address,
                gdprConsent: apiUser.metadata?.gdpr_consent || false,
                marketingConsent: apiUser.metadata?.marketing_consent || false,
                rawData: apiUser as any,
                syncedAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Sync all events
     */
    async syncEvents(
        tenantId: string,
        integrationId: string,
    ): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'events',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, enabled: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
            }
            if (!integration.organizationId) {
                throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing events for tenant ${tenantId}, organization ${organizationId}`);

            const response = await this.weezeventClient.getEvents(
                tenantId,
                organizationId,
                { perPage: 100 },
            );

            // Safe date parsing helper
            const parseDate = (dateStr: string | undefined): Date | null => {
                if (!dateStr) return null;
                const parsed = new Date(dateStr);
                return isNaN(parsed.getTime()) ? null : parsed;
            };

            // OPTIMIZED: Batch operations instead of individual queries
            const weezeventIds = response.data.map(e => e.id.toString());
            
            // Single query to get all existing events
            const existingEvents = await this.prisma.weezeventEvent.findMany({
                where: { tenantId, integrationId, weezeventId: { in: weezeventIds } },
                select: { weezeventId: true },
            });
            const existingIds = new Set(existingEvents.map(e => e.weezeventId));

            // Prepare data for batch operations
            const eventsToCreate: any[] = [];
            const eventsToUpdate: { weezeventId: string; data: any }[] = [];

            for (const apiEvent of response.data) {
                try {
                    const weezeventId = apiEvent.id.toString();
                    
                    // Support both date formats: start_date/end_date OR live_start/live_end
                    const startDateStr = apiEvent.live_start || apiEvent.start_date;
                    const endDateStr = apiEvent.live_end || apiEvent.end_date;
                    
                    // Support both location formats
                    const locationStr = apiEvent.location || apiEvent.venue || null;
                    
                    // Extract status as string (API returns object with name/title)
                    const eventStatus = apiEvent.status as any;
                    const statusValue = typeof eventStatus === 'object' && eventStatus?.name 
                        ? eventStatus.name 
                        : (typeof eventStatus === 'string' ? eventStatus : 'unknown');
                    
                    const eventData = {
                        name: apiEvent.name || `Event ${apiEvent.id}`,
                        organizationId,
                        startDate: parseDate(startDateStr),
                        endDate: parseDate(endDateStr),
                        description: apiEvent.description || apiEvent.name || null,
                        location: locationStr,
                        capacity: apiEvent.capacity || null,
                        status: statusValue,
                        metadata: apiEvent.metadata || null,
                        rawData: apiEvent as any,
                        syncedAt: new Date(),
                    };

                    if (existingIds.has(weezeventId)) {
                        eventsToUpdate.push({ weezeventId, data: eventData });
                    } else {
                        eventsToCreate.push({
                            weezeventId,
                            tenantId,
                            integrationId,
                            ...eventData,
                        });
                    }
                } catch (error) {
                    this.logger.error(`Failed to prepare event ${apiEvent.id}`, (error as Error).stack);
                    result.errors++;
                }
            }

            // Batch create new events
            if (eventsToCreate.length > 0) {
                await this.prisma.weezeventEvent.createMany({
                    data: eventsToCreate,
                    skipDuplicates: true,
                });
                result.itemsCreated = eventsToCreate.length;
            }

            // Batch update existing events using transaction
            if (eventsToUpdate.length > 0) {
                await this.prisma.$transaction(
                    eventsToUpdate.map(({ weezeventId, data }) =>
                        this.prisma.weezeventEvent.update({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            data,
                        })
                    )
                );
                result.itemsUpdated = eventsToUpdate.length;
            }

            result.itemsSynced = eventsToCreate.length + eventsToUpdate.length;

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            // Update sync state so the frontend can detect completion via lastSyncedAt
            await this.prisma.weezeventSyncState.upsert({
                where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType: 'events' } },
                create: {
                    tenantId,
                    integrationId,
                    syncType: 'events',
                    lastSyncedAt: new Date(),
                    lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration,
                    totalSynced: result.itemsSynced,
                },
                update: {
                    lastSyncedAt: new Date(),
                    lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration,
                    totalSynced: { increment: result.itemsSynced },
                },
            });

            return result;
        } catch (error) {
            this.logger.error('Events sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Stable fingerprint for a Weezevent product API object.
     * Uses only scalar fields that are reliably comparable after a DB JSON roundtrip.
     * Avoids JSON.stringify on the full object which is fragile (key ordering, numeric
     * coercion, null vs undefined) and would cause false-positive "changed" on every run.
     */
    private productFingerprint(p: any): string {
        return [
            p?.id,
            p?.name,
            p?.description ?? '',
            p?.category ?? '',
            String(p?.base_price ?? ''),
            String(p?.vat_rate ?? ''),
            p?.image ?? '',
        ].join('|');
    }

    /**
     * Sync all products
     */
    async syncProducts(tenantId: string, integrationId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'products',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, enabled: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
            }
            if (!integration.organizationId) {
                throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing products for tenant ${tenantId}, organization ${organizationId}`);

            const response = await this.weezeventClient.getProducts(
                tenantId,
                organizationId,
                { perPage: 100 },
            );

            // OPTIMIZED: Batch operations instead of individual queries
            const weezeventIds = response.data.map(p => p.id.toString());

            // Single query to get all existing products WITH rawData for change detection
            const existingProducts = await this.prisma.weezeventProduct.findMany({
                where: { tenantId, integrationId, weezeventId: { in: weezeventIds } },
                select: { weezeventId: true, rawData: true },
            });
            const existingMap = new Map(existingProducts.map(p => [p.weezeventId, p.rawData]));

            // Prepare data for batch operations
            const productsToCreate: any[] = [];
            const productsToUpdate: { weezeventId: string; data: any }[] = [];
            // Only sync details for new or changed products (saves ~200 API calls on unchanged runs)
            const productIdsNeedingDetailSync: string[] = [];

            for (const apiProduct of response.data) {
                const weezeventId = apiProduct.id.toString();
                const productData = {
                    name: apiProduct.name || `Product ${apiProduct.id}`,
                    description: apiProduct.description || null,
                    category: apiProduct.category || null,
                    basePrice: apiProduct.base_price || null,
                    vatRate: apiProduct.vat_rate || null,
                    image: apiProduct.image || null,
                    allergens: apiProduct.allergens || [],
                    components: apiProduct.components || null,
                    variants: apiProduct.variants || null,
                    metadata: apiProduct.metadata || null,
                    rawData: apiProduct as any,
                    syncedAt: new Date(),
                };

                if (existingMap.has(weezeventId)) {
                    // Compare only stable scalar fields to avoid false positives from JSON
                    // roundtrip differences (key ordering, numeric coercion, nulls) that
                    // would otherwise trigger a full detail re-sync on every run.
                    const storedRaw = existingMap.get(weezeventId) as any;
                    const hasChanged = this.productFingerprint(storedRaw) !== this.productFingerprint(apiProduct);
                    if (hasChanged) {
                        productsToUpdate.push({ weezeventId, data: productData });
                        productIdsNeedingDetailSync.push(weezeventId);
                    }
                } else {
                    productsToCreate.push({ weezeventId, tenantId, integrationId, ...productData });
                    productIdsNeedingDetailSync.push(weezeventId);
                }
            }

            // Batch create new products
            if (productsToCreate.length > 0) {
                await this.prisma.weezeventProduct.createMany({
                    data: productsToCreate,
                    skipDuplicates: true,
                });
                result.itemsCreated = productsToCreate.length;
            }

            // Batch update changed products only
            if (productsToUpdate.length > 0) {
                await this.prisma.$transaction(
                    productsToUpdate.map(({ weezeventId, data }) =>
                        this.prisma.weezeventProduct.update({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            data,
                        })
                    )
                );
                result.itemsUpdated = productsToUpdate.length;
            }

            result.itemsSynced = productsToCreate.length + productsToUpdate.length;

            // Sync variants/components ONLY for new or changed products
            const skippedDetails = response.data.length - productIdsNeedingDetailSync.length;
            this.logger.log(
                `Syncing variants/components for ${productIdsNeedingDetailSync.length}/${response.data.length} products` +
                (skippedDetails > 0 ? ` (${skippedDetails} unchanged — skipped)` : ''),
            );

            const CONCURRENCY = 5;
            for (let i = 0; i < productIdsNeedingDetailSync.length; i += CONCURRENCY) {
                const chunk = productIdsNeedingDetailSync.slice(i, i + CONCURRENCY);
                await Promise.allSettled(
                    chunk.map(productId =>
                        this.syncProductDetails(tenantId, integrationId, organizationId, productId)
                            .catch((error: Error) =>
                                this.logger.warn(`Failed to sync details for product ${productId}: ${error.message}`)
                            )
                    )
                );
            }

            result.success = true;
            result.duration = Date.now() - startTime;

            this.logger.log(`Products sync completed: ${result.itemsSynced} synced (${result.itemsCreated} created, ${result.itemsUpdated} updated) in ${result.duration}ms`);

            // Update sync state so the frontend can detect completion via lastSyncedAt
            await this.prisma.weezeventSyncState.upsert({
                where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType: 'products' } },
                create: {
                    tenantId,
                    integrationId,
                    syncType: 'products',
                    lastSyncedAt: new Date(),
                    lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration,
                    totalSynced: result.itemsSynced,
                },
                update: {
                    lastSyncedAt: new Date(),
                    lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration,
                    totalSynced: { increment: result.itemsSynced },
                },
            });

            return result;
        } catch (error) {
            this.logger.error('Products sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync product details: variants, components, menu-steps
     * P1: Parallelized for 75% faster sync
     */
    private async syncProductDetails(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        productId: string,
    ): Promise<void> {
        // Get the product from DB to link relations
        const product = await this.prisma.weezeventProduct.findUnique({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: productId } },
            select: { id: true, weezeventId: true },
        });

        if (!product) {
            this.logger.warn(`Product ${productId} not found in DB, skipping details sync`);
            return;
        }

        // P1: Fetch variants and components in parallel
        const [variantsResult, componentsResult] = await Promise.allSettled([
            this.weezeventClient.getProductVariants(tenantId, organizationId, productId),
            this.weezeventClient.getProductComponents(tenantId, organizationId, productId),
        ]);

        // Process variants
        if (variantsResult.status === 'fulfilled') {
            try {
                const variants = variantsResult.value;

                // Delete existing variants
                await this.prisma.weezeventProductVariant.deleteMany({
                    where: { productId: product.id },
                });

                // Create new variants
                if (variants.length > 0) {
                    const variantsData = variants.map((v: any) => ({
                        weezeventId: v.id?.toString() || `${productId}-variant-${v.name}`,
                        tenantId,
                        integrationId,
                        productId: product.id,
                        name: v.name || 'Unnamed Variant',
                        description: v.description || null,
                        price: v.price || null,
                        sku: v.sku || null,
                        stock: v.stock || null,
                        isDefault: v.is_default || false,
                        metadata: v.metadata || null,
                        rawData: v,
                        syncedAt: new Date(),
                    }));

                    await this.prisma.weezeventProductVariant.createMany({
                        data: variantsData,
                        skipDuplicates: true,
                    });

                    this.logger.debug(`✅ P1: Synced ${variants.length} variants for product ${productId}`);
                }
            } catch (error) {
                this.logger.warn(`Failed to sync variants for product ${productId}: ${(error as Error).message}`);
            }
        } else {
            this.logger.warn(`Failed to fetch variants for product ${productId}: ${variantsResult.reason}`);
        }

        // Process components
        if (componentsResult.status === 'fulfilled') {
            try {
                const components = componentsResult.value;

                // Delete existing components
                await this.prisma.weezeventProductComponent.deleteMany({
                    where: { productId: product.id },
                });

                // Create new components
                if (components.length > 0) {
                    const componentsData = components.map((c: any) => ({
                        weezeventId: c.id?.toString() || `${productId}-component-${c.name}`,
                        tenantId,
                        integrationId,
                        productId: product.id,
                        name: c.name || 'Unnamed Component',
                        description: c.description || null,
                        quantity: c.quantity || null,
                        unit: c.unit || null,
                        isRequired: c.is_required !== false,
                        metadata: c.metadata || null,
                        rawData: c,
                        syncedAt: new Date(),
                    }));

                    await this.prisma.weezeventProductComponent.createMany({
                        data: componentsData,
                        skipDuplicates: true,
                    });

                    this.logger.debug(`✅ P1: Synced ${components.length} components for product ${productId}`);
                }
            } catch (error) {
                this.logger.warn(`Failed to sync components for product ${productId}: ${(error as Error).message}`);
            }
        } else {
            this.logger.warn(`Failed to fetch components for product ${productId}: ${componentsResult.reason}`);
        }

        // Note: menu-steps are stored in rawData for now (complex structure)
        // Can be extracted later if needed for specific use cases
    }

    /**
     * Sync orders for an event
     */
    async syncOrders(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'orders',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.organizationId) {
                throw new Error(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing orders for event ${eventId}`);

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await this.weezeventClient.getOrders(
                    tenantId,
                    organizationId,
                    eventId,
                    { page, perPage: 100 },
                );

                for (const apiOrder of response.data) {
                    try {
                        const weezeventId = apiOrder.id.toString();
                        const existing = await this.prisma.weezeventOrder.findUnique({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                        });

                        await this.prisma.weezeventOrder.upsert({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            create: {
                                weezeventId,
                                tenantId,
                                integrationId,
                                eventId,
                                eventName: apiOrder.event_name || null,
                                userId: apiOrder.user_id?.toString() || null,
                                userEmail: apiOrder.user_email || null,
                                status: apiOrder.status || 'unknown',
                                totalAmount: apiOrder.total_amount || 0,
                                orderDate: apiOrder.order_date ? new Date(apiOrder.order_date) : new Date(),
                                paymentMethod: apiOrder.payment_method || null,
                                metadata: apiOrder.metadata || null,
                                rawData: apiOrder,
                                syncedAt: new Date(),
                            },
                            update: {
                                status: apiOrder.status || 'unknown',
                                totalAmount: apiOrder.total_amount || 0,
                                rawData: apiOrder,
                                syncedAt: new Date(),
                            },
                        });

                        result.itemsSynced++;
                        if (existing) result.itemsUpdated++;
                        else result.itemsCreated++;
                    } catch (error) {
                        this.logger.error(`Failed to sync order ${apiOrder.id}`, error);
                        result.errors++;
                    }
                }

                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(`Orders sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);

            return result;
        } catch (error) {
            this.logger.error('Orders sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync prices
     */
    async syncPrices(tenantId: string, integrationId: string, eventId?: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'prices',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.organizationId) {
                throw new Error(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing prices${eventId ? ` for event ${eventId}` : ''}`);

            const response = await this.weezeventClient.getPrices(
                tenantId,
                organizationId,
                eventId,
                { perPage: 100 },
            );

            for (const apiPrice of response.data) {
                try {
                    const weezeventId = apiPrice.id.toString();
                    const existing = await this.prisma.weezeventPrice.findUnique({
                        where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                    });

                    await this.prisma.weezeventPrice.upsert({
                        where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                        create: {
                            weezeventId,
                            tenantId,
                            integrationId,
                            eventId: eventId || apiPrice.event_id?.toString() || null,
                            productId: apiPrice.product_id?.toString() || null,
                            name: apiPrice.name || 'Unnamed Price',
                            amount: apiPrice.amount || 0,
                            currency: apiPrice.currency || 'EUR',
                            validFrom: apiPrice.valid_from ? new Date(apiPrice.valid_from) : null,
                            validUntil: apiPrice.valid_until ? new Date(apiPrice.valid_until) : null,
                            priceType: apiPrice.price_type || null,
                            metadata: apiPrice.metadata || null,
                            rawData: apiPrice,
                            syncedAt: new Date(),
                        },
                        update: {
                            amount: apiPrice.amount || 0,
                            validFrom: apiPrice.valid_from ? new Date(apiPrice.valid_from) : null,
                            validUntil: apiPrice.valid_until ? new Date(apiPrice.valid_until) : null,
                            rawData: apiPrice,
                            syncedAt: new Date(),
                        },
                    });

                    result.itemsSynced++;
                    if (existing) result.itemsUpdated++;
                    else result.itemsCreated++;
                } catch (error) {
                    this.logger.error(`Failed to sync price ${apiPrice.id}`, error);
                    result.errors++;
                }
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(`Prices sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);

            return result;
        } catch (error) {
            this.logger.error('Prices sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync attendees for an event
     */
    async syncAttendees(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'attendees',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId || !integration.organizationId) {
                throw new Error(`Weezevent integration ${integrationId} not configured for tenant ${tenantId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing attendees for event ${eventId}`);

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await this.weezeventClient.getAttendees(
                    tenantId,
                    organizationId,
                    eventId,
                    { page, perPage: 100 },
                );

                for (const apiAttendee of response.data) {
                    try {
                        const weezeventId = apiAttendee.id.toString();
                        const existing = await this.prisma.weezeventAttendee.findUnique({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                        });

                        await this.prisma.weezeventAttendee.upsert({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            create: {
                                weezeventId,
                                tenantId,
                                integrationId,
                                eventId,
                                eventName: apiAttendee.event_name || null,
                                email: apiAttendee.email || null,
                                firstName: apiAttendee.first_name || null,
                                lastName: apiAttendee.last_name || null,
                                ticketType: apiAttendee.ticket_type || null,
                                status: apiAttendee.status || 'unknown',
                                metadata: apiAttendee.metadata || null,
                                rawData: apiAttendee,
                                syncedAt: new Date(),
                            },
                            update: {
                                status: apiAttendee.status || 'unknown',
                                rawData: apiAttendee,
                                syncedAt: new Date(),
                            },
                        });

                        result.itemsSynced++;
                        if (existing) result.itemsUpdated++;
                        else result.itemsCreated++;
                    } catch (error) {
                        this.logger.error(`Failed to sync attendee ${apiAttendee.id}`, error);
                        result.errors++;
                    }
                }

                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(`Attendees sync completed: ${result.itemsSynced} synced in ${result.duration}ms`);

            return result;
        } catch (error) {
            this.logger.error('Attendees sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }
}
