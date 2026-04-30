import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';

export interface IncrementalSyncOptions {
    // Force full sync (ignore last sync state)
    forceFullSync?: boolean;
    // Maximum items per batch
    batchSize?: number;
    // Maximum total items to sync in one run (prevent memory issues)
    maxItems?: number;
    // Sync only items updated after this date
    updatedSince?: Date;
    // Progress callback: receives 0-100 as pages are processed
    onProgress?: (pct: number) => Promise<void>;
}

export interface IncrementalSyncResult {
    type: string;
    success: boolean;
    isIncremental: boolean;
    itemsSynced: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsSkipped: number;
    errors: number;
    duration: number;
    hasMore: boolean;
    checkpoint?: any;
}

interface SyncState {
    lastSyncedAt: Date | null;
    lastCursor: string | null;
    lastWeezeventId: string | null;
    lastUpdatedAt: Date | null;
    checkpoint: any | null;
}

@Injectable()
export class WeezeventIncrementalSyncService {
    private readonly logger = new Logger(WeezeventIncrementalSyncService.name);

    // Default batch sizes optimized for memory
    private readonly DEFAULT_BATCH_SIZE = 500;
    private readonly MAX_ITEMS_PER_RUN = 10000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    // ==================== EVENTS INCREMENTAL SYNC ====================

    /**
     * Sync events incrementally - only new/updated events
     */
    async syncEventsIncremental(
        tenantId: string,
        options: IncrementalSyncOptions = {},
    ): Promise<IncrementalSyncResult> {
        const startTime = Date.now();
        const syncType = 'events';
        
        const result: IncrementalSyncResult = {
            type: syncType,
            success: false,
            isIncremental: !options.forceFullSync,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errors: 0,
            duration: 0,
            hasMore: false,
        };

        try {
            // 1. Get tenant config
            const tenant = await this.getTenantConfig(tenantId);
            const organizationId = tenant.weezeventOrganizationId!;

            // 2. Get sync state (last sync info)
            const syncState = await this.getSyncState(tenantId, syncType);
            
            // 3. Determine sync strategy
            const isFirstSync = !syncState.lastSyncedAt;
            const useIncremental = !options.forceFullSync && !isFirstSync;

            this.logger.log(
                `Starting ${useIncremental ? 'INCREMENTAL' : 'FULL'} events sync for tenant ${tenantId}`,
            );

            // 4. Fetch events from API with filters
            const apiParams: any = {
                perPage: options.batchSize || this.DEFAULT_BATCH_SIZE,
            };

            // Use updated_since for incremental sync (if API supports it)
            if (useIncremental && syncState.lastUpdatedAt) {
                apiParams.updated_since = syncState.lastUpdatedAt.toISOString();
                this.logger.log(`Fetching events updated since ${syncState.lastUpdatedAt.toISOString()}`);
            }

            // 5. Get all existing event IDs in one query (for fast lookup)
            const existingEventsMap = await this.getExistingEventsMap(tenantId);

            // 6. Paginate through API results
            let page = 1;
            let hasMore = true;
            let totalProcessed = 0;
            const maxItems = options.maxItems || this.MAX_ITEMS_PER_RUN;
            let lastProcessedUpdatedAt: Date | null = null;

            while (hasMore && totalProcessed < maxItems) {
                const response = await this.weezeventClient.getEvents(
                    tenantId,
                    organizationId,
                    { ...apiParams, page },
                );

                const events = response.data;
                
                if (events.length === 0) {
                    hasMore = false;
                    break;
                }

                // 7. Process batch with optimized upsert
                const batchResult = await this.processBatchEvents(
                    tenantId,
                    organizationId,
                    events,
                    existingEventsMap,
                    useIncremental,
                );

                result.itemsCreated += batchResult.created;
                result.itemsUpdated += batchResult.updated;
                result.itemsSkipped += batchResult.skipped;
                result.errors += batchResult.errors;
                totalProcessed += events.length;

                // Track last updated_at for next incremental sync
                for (const event of events) {
                    const eventUpdatedAt = event.updated_at ? new Date(event.updated_at) : null;
                    if (eventUpdatedAt && (!lastProcessedUpdatedAt || eventUpdatedAt > lastProcessedUpdatedAt)) {
                        lastProcessedUpdatedAt = eventUpdatedAt;
                    }
                }

                // Check pagination
                hasMore = response.meta.current_page < response.meta.total_pages;

                // Report real progress based on pages
                if (options.onProgress) {
                    const totalPages = response.meta.total_pages || 1;
                    const donePct = Math.min(99, Math.round((page / totalPages) * 100));
                    await options.onProgress(donePct).catch(() => {});
                }

                page++;

                this.logger.debug(
                    `Processed page ${page - 1}: ${events.length} events (total: ${totalProcessed})`,
                );
            }

            result.itemsSynced = result.itemsCreated + result.itemsUpdated;
            result.hasMore = hasMore;

            // 8. Update sync state
            await this.updateSyncState(tenantId, syncType, {
                lastSyncedAt: new Date(),
                lastUpdatedAt: lastProcessedUpdatedAt || new Date(),
                lastSyncCount: result.itemsSynced,
                lastSyncDuration: Date.now() - startTime,
                totalSynced: syncState.checkpoint?.totalSynced 
                    ? syncState.checkpoint.totalSynced + result.itemsSynced 
                    : result.itemsSynced,
                consecutiveErrors: 0,
                lastError: null,
            });

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `✅ Events sync completed: ${result.itemsSynced} synced (${result.itemsCreated} new, ${result.itemsUpdated} updated, ${result.itemsSkipped} skipped) in ${result.duration}ms`,
            );

            // 9. Sync locations for all events of this tenant
            try {
                await this.syncLocationsFromApi(tenantId, organizationId);
            } catch (locErr) {
                this.logger.warn(`Locations sync failed (non-blocking): ${(locErr as Error).message}`);
            }

            return result;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Events sync failed', err.stack);

            // Update error state
            await this.updateSyncStateError(tenantId, syncType, err.message);

            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ==================== TRANSACTIONS INCREMENTAL SYNC ====================

    /**
     * Sync transactions incrementally - only new/updated transactions
     */
    async syncTransactionsIncremental(
        tenantId: string,
        options: IncrementalSyncOptions = {},
    ): Promise<IncrementalSyncResult> {
        const startTime = Date.now();
        const syncType = 'transactions';

        const result: IncrementalSyncResult = {
            type: syncType,
            success: false,
            isIncremental: !options.forceFullSync,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            itemsSkipped: 0,
            errors: 0,
            duration: 0,
            hasMore: false,
        };

        try {
            const tenant = await this.getTenantConfig(tenantId);
            const organizationId = tenant.weezeventOrganizationId!;

            const syncState = await this.getSyncState(tenantId, syncType);
            const isFirstSync = !syncState.lastSyncedAt;
            const useIncremental = !options.forceFullSync && !isFirstSync;

            this.logger.log(
                `Starting ${useIncremental ? 'INCREMENTAL' : 'FULL'} transactions sync for tenant ${tenantId}`,
            );

            // Build API params
            // On first full sync: no date limit → fetch ALL transactions from Weezevent.
            // On incremental: overlap 5 min to avoid gaps.
            const fromDate = useIncremental && syncState.lastSyncedAt
                ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000) // 5 min overlap
                : options.updatedSince ?? null; // null = no filter = all time on first sync

            // Get existing transaction IDs for fast lookup
            const existingIds = await this.getExistingTransactionIds(tenantId, fromDate);

            let page = 1;
            let hasMore = true;
            let totalProcessed = 0;
            const maxItems = options.maxItems || this.MAX_ITEMS_PER_RUN;
            const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;

            while (hasMore && totalProcessed < maxItems) {
                const response = await this.weezeventClient.getTransactions(
                    tenantId,
                    organizationId,
                    {
                        page,
                        perPage: batchSize,
                        fromDate,
                    },
                );

                const transactions = response.data;

                if (transactions.length === 0) {
                    hasMore = false;
                    break;
                }

                // Filter already existing (for true incremental - skip updates if not needed)
                const newTransactions = useIncremental
                    ? transactions.filter(t => !existingIds.has(t.id.toString()))
                    : transactions;

                result.itemsSkipped += transactions.length - newTransactions.length;

                if (newTransactions.length > 0) {
                    // Batch upsert
                    const batchResult = await this.processBatchTransactions(
                        tenantId,
                        newTransactions,
                        existingIds,
                    );

                    result.itemsCreated += batchResult.created;
                    result.itemsUpdated += batchResult.updated;
                    result.errors += batchResult.errors;

                    // Add new IDs to set
                    newTransactions.forEach(t => existingIds.add(t.id.toString()));
                }

                totalProcessed += transactions.length;
                hasMore = response.meta.current_page < response.meta.total_pages;

                // Report progress: transactions have no total, so estimate via items processed vs maxItems
                // This gives a real signal that advances with the data, capped at 95% until done.
                if (options.onProgress) {
                    const estimatedPct = Math.min(95, Math.round((totalProcessed / maxItems) * 100));
                    await options.onProgress(estimatedPct).catch(() => {});
                }

                page++;

                this.logger.debug(
                    `Processed page ${page - 1}: ${transactions.length} transactions (${newTransactions.length} new)`,
                );
            }

            result.itemsSynced = result.itemsCreated + result.itemsUpdated;
            result.hasMore = hasMore;

            // Update sync state
            await this.updateSyncState(tenantId, syncType, {
                lastSyncedAt: new Date(),
                lastSyncCount: result.itemsSynced,
                lastSyncDuration: Date.now() - startTime,
                consecutiveErrors: 0,
                lastError: null,
            });

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `✅ Transactions sync completed: ${result.itemsSynced} synced (${result.itemsCreated} new, ${result.itemsSkipped} skipped) in ${result.duration}ms`,
            );

            return result;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Transactions sync failed', err.stack);
            await this.updateSyncStateError(tenantId, syncType, err.message);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Get tenant config with validation
     */
    private async getTenantConfig(tenantId: string) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true,
                weezeventOrganizationId: true,
                weezeventEnabled: true,
            },
        });

        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found`);
        }

        if (!tenant.weezeventEnabled) {
            throw new Error(`Weezevent not enabled for tenant ${tenantId}`);
        }

        if (!tenant.weezeventOrganizationId) {
            throw new Error(`Weezevent organization ID not configured for tenant ${tenantId}`);
        }

        return tenant;
    }

    /**
     * Get sync state from database
     */
    private async getSyncState(tenantId: string, syncType: string): Promise<SyncState> {
        const state = await this.prisma.weezeventSyncState.findUnique({
            where: {
                tenantId_syncType: { tenantId, syncType },
            },
        });

        return {
            lastSyncedAt: state?.lastSyncedAt || null,
            lastCursor: state?.lastCursor || null,
            lastWeezeventId: state?.lastWeezeventId || null,
            lastUpdatedAt: state?.lastUpdatedAt || null,
            checkpoint: state?.checkpoint || null,
        };
    }

    /**
     * Update sync state after successful sync
     */
    private async updateSyncState(
        tenantId: string,
        syncType: string,
        data: {
            lastSyncedAt?: Date;
            lastCursor?: string;
            lastWeezeventId?: string;
            lastUpdatedAt?: Date;
            lastSyncCount?: number;
            lastSyncDuration?: number;
            totalSynced?: number;
            consecutiveErrors?: number;
            lastError?: string | null;
            checkpoint?: any;
        },
    ) {
        await this.prisma.weezeventSyncState.upsert({
            where: {
                tenantId_syncType: { tenantId, syncType },
            },
            create: {
                tenantId,
                syncType,
                ...data,
            },
            update: data,
        });
    }

    /**
     * Update sync state on error
     */
    private async updateSyncStateError(tenantId: string, syncType: string, error: string) {
        const current = await this.prisma.weezeventSyncState.findUnique({
            where: { tenantId_syncType: { tenantId, syncType } },
        });

        await this.prisma.weezeventSyncState.upsert({
            where: { tenantId_syncType: { tenantId, syncType } },
            create: {
                tenantId,
                syncType,
                lastError: error,
                consecutiveErrors: 1,
            },
            update: {
                lastError: error,
                consecutiveErrors: (current?.consecutiveErrors || 0) + 1,
            },
        });
    }

    /**
     * Get all existing event IDs as a Map for O(1) lookup
     */
    private async getExistingEventsMap(tenantId: string): Promise<Map<string, { syncedAt: Date }>> {
        const events = await this.prisma.weezeventEvent.findMany({
            where: { tenantId },
            select: { weezeventId: true, syncedAt: true },
        });

        return new Map(events.map(e => [e.weezeventId, { syncedAt: e.syncedAt }]));
    }

    /**
     * Get existing transaction IDs as a Set for O(1) lookup
     * Only fetch IDs for transactions after fromDate to limit memory
     */
    private async getExistingTransactionIds(tenantId: string, fromDate: Date): Promise<Set<string>> {
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where: {
                tenantId,
                transactionDate: { gte: fromDate },
            },
            select: { weezeventId: true },
        });

        return new Set(transactions.map(t => t.weezeventId));
    }

    /**
     * Process batch of events with optimized upserts
     */
    private async processBatchEvents(
        tenantId: string,
        organizationId: string,
        events: any[],
        existingMap: Map<string, { syncedAt: Date }>,
        incrementalMode: boolean,
    ): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
        const result = { created: 0, updated: 0, skipped: 0, errors: 0 };

        const parseDate = (dateStr: string | undefined): Date | null => {
            if (!dateStr) return null;
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed;
        };

        const toCreate: any[] = [];
        const toUpdate: { weezeventId: string; data: any }[] = [];

        for (const apiEvent of events) {
            try {
                const weezeventId = apiEvent.id.toString();
                const existing = existingMap.get(weezeventId);

                // In incremental mode, skip if already synced recently
                if (incrementalMode && existing) {
                    const apiUpdatedAt = apiEvent.updated_at ? new Date(apiEvent.updated_at) : null;
                    if (apiUpdatedAt && existing.syncedAt >= apiUpdatedAt) {
                        result.skipped++;
                        continue;
                    }
                }

                // Extract status as string (API returns object with name/title)
                const eventStatus = apiEvent.status as any;
                const statusValue = typeof eventStatus === 'object' && eventStatus?.name 
                    ? eventStatus.name 
                    : (typeof eventStatus === 'string' ? eventStatus : 'unknown');

                const eventData = {
                    name: apiEvent.name || `Event ${apiEvent.id}`,
                    organizationId,
                    startDate: parseDate(apiEvent.live_start || apiEvent.start_date),
                    endDate: parseDate(apiEvent.live_end || apiEvent.end_date),
                    description: apiEvent.description || apiEvent.name || null,
                    location: apiEvent.location || apiEvent.venue || null,
                    capacity: apiEvent.capacity || null,
                    status: statusValue,
                    metadata: apiEvent.metadata || null,
                    rawData: apiEvent as any,
                    syncedAt: new Date(),
                };

                if (existing) {
                    toUpdate.push({ weezeventId, data: eventData });
                } else {
                    toCreate.push({
                        weezeventId,
                        tenantId,
                        ...eventData,
                    });
                    // Add to map for subsequent checks
                    existingMap.set(weezeventId, { syncedAt: new Date() });
                }
            } catch (error) {
                this.logger.error(`Failed to process event ${apiEvent.id}`, error);
                result.errors++;
            }
        }

        // Batch create
        if (toCreate.length > 0) {
            await this.prisma.weezeventEvent.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = toCreate.length;
        }

        // Batch update using transaction
        if (toUpdate.length > 0) {
            await this.prisma.$transaction(
                toUpdate.map(({ weezeventId, data }) =>
                    this.prisma.weezeventEvent.update({
                        where: { weezeventId },
                        data,
                    })
                )
            );
            result.updated = toUpdate.length;
        }

        return result;
    }

    /**
     * Process batch of transactions with optimized upserts
     */
    private async processBatchTransactions(
        tenantId: string,
        transactions: any[],
        existingIds: Set<string>,
    ): Promise<{ created: number; updated: number; errors: number }> {
        const result = { created: 0, updated: 0, errors: 0 };

        const toCreate: any[] = [];

        // Build a map of weezeventId -> internal DB id for events referenced by these transactions
        const referencedEventWeezeventIds = [
            ...new Set(
                transactions
                    .map(t => t.event_id?.toString())
                    .filter(Boolean),
            ),
        ];

        const eventIdMap = new Map<string, string>();
        if (referencedEventWeezeventIds.length > 0) {
            const events = await this.prisma.weezeventEvent.findMany({
                where: {
                    tenantId,
                    weezeventId: { in: referencedEventWeezeventIds },
                },
                select: { id: true, weezeventId: true },
            });
            for (const e of events) {
                eventIdMap.set(e.weezeventId, e.id);
            }
        }

        // Build a map of weezeventId -> internal DB id for locations referenced by these transactions
        const referencedLocationWeezeventIds = [
            ...new Set(
                transactions
                    .map(t => t.location_id?.toString())
                    .filter(Boolean),
            ),
        ];

        const locationIdMap = new Map<string, string>();
        if (referencedLocationWeezeventIds.length > 0) {
            const locations = await this.prisma.weezeventLocation.findMany({
                where: {
                    tenantId,
                    weezeventId: { in: referencedLocationWeezeventIds },
                },
                select: { id: true, weezeventId: true },
            });
            for (const l of locations) {
                locationIdMap.set(l.weezeventId, l.id);
            }
        }

        // Build a map of weezeventId -> internal DB id for merchants referenced by these transactions
        const referencedMerchantWeezeventIds = [
            ...new Set(
                transactions
                    .map(t => t.merchant_id?.toString())
                    .filter(Boolean),
            ),
        ];

        const merchantIdMap = new Map<string, string>();
        if (referencedMerchantWeezeventIds.length > 0) {
            const merchants = await this.prisma.weezeventMerchant.findMany({
                where: {
                    tenantId,
                    weezeventId: { in: referencedMerchantWeezeventIds },
                },
                select: { id: true, weezeventId: true },
            });
            for (const m of merchants) {
                merchantIdMap.set(m.weezeventId, m.id);
            }
        }

        for (const apiTransaction of transactions) {
            try {
                const weezeventId = apiTransaction.id.toString();
                const isNew = !existingIds.has(weezeventId);

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

                // Resolve eventId to the internal DB id (FK points to WeezeventEvent.id, not weezeventId)
                const apiEventId = apiTransaction.event_id?.toString();
                const resolvedEventId = apiEventId ? (eventIdMap.get(apiEventId) ?? null) : null;

                if (apiEventId && !resolvedEventId) {
                    this.logger.warn(
                        `Transaction ${weezeventId} references event ${apiEventId} not found in DB — storing without eventId`,
                    );
                }

                // Resolve locationId to the internal DB id (FK points to WeezeventLocation.id, not weezeventId)
                const apiLocationId = apiTransaction.location_id?.toString();
                const resolvedLocationId = apiLocationId ? (locationIdMap.get(apiLocationId) ?? null) : null;

                if (apiLocationId && !resolvedLocationId) {
                    this.logger.warn(
                        `Transaction ${weezeventId} references location ${apiLocationId} not found in DB — storing without locationId`,
                    );
                }

                // Resolve merchantId to the internal DB id (FK points to WeezeventMerchant.id, not weezeventId)
                const apiMerchantId = apiTransaction.merchant_id?.toString();
                const resolvedMerchantId = apiMerchantId ? (merchantIdMap.get(apiMerchantId) ?? null) : null;

                if (apiMerchantId && !resolvedMerchantId) {
                    this.logger.warn(
                        `Transaction ${weezeventId} references merchant ${apiMerchantId} not found in DB — storing without merchantId`,
                    );
                }

                const transactionData = {
                    weezeventId,
                    tenantId,
                    amount: apiTransaction.amount || 0,
                    status: statusValue,
                    transactionDate,
                    eventId: resolvedEventId,
                    eventName: apiTransaction.event_name,
                    merchantId: resolvedMerchantId,
                    merchantName: apiTransaction.merchant_name,
                    locationId: resolvedLocationId,
                    locationName: apiTransaction.location_name,
                    sellerId: apiTransaction.seller_id?.toString(),
                    rawData: apiTransaction as any,
                    syncedAt: new Date(),
                };

                if (isNew) {
                    toCreate.push(transactionData);
                }
                // Note: For transactions, we typically don't update - they're immutable
                // If updates are needed, add toUpdate logic similar to events

            } catch (error) {
                this.logger.error(`Failed to process transaction ${apiTransaction.id}`, error);
                result.errors++;
            }
        }

        // Batch create
        if (toCreate.length > 0) {
            await this.prisma.weezeventTransaction.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = toCreate.length;
        }

        return result;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get sync status for a tenant
     */
    async getSyncStatus(tenantId: string) {
        const states = await this.prisma.weezeventSyncState.findMany({
            where: { tenantId },
        });

        return states.reduce((acc, state) => {
            acc[state.syncType] = {
                lastSyncedAt: state.lastSyncedAt,
                lastSyncCount: state.lastSyncCount,
                lastSyncDuration: state.lastSyncDuration,
                totalSynced: state.totalSynced,
                lastError: state.lastError,
                consecutiveErrors: state.consecutiveErrors,
            };
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Reset sync state (force full sync next time)
     */
    async resetSyncState(tenantId: string, syncType?: string) {
        if (syncType) {
            await this.prisma.weezeventSyncState.deleteMany({
                where: { tenantId, syncType },
            });
        } else {
            await this.prisma.weezeventSyncState.deleteMany({
                where: { tenantId },
            });
        }

        this.logger.log(`Reset sync state for tenant ${tenantId}${syncType ? ` (${syncType})` : ''}`);
    }

    // ==================== LOCATIONS SYNC ====================

    /**
     * Sync locations directly from WeezPay API for all events of this tenant.
     * Called at the end of syncEventsIncremental (non-blocking).
     */
    private async syncLocationsFromApi(tenantId: string, organizationId: string): Promise<void> {
        const events = await this.prisma.weezeventEvent.findMany({
            where: { tenantId },
            select: { id: true, weezeventId: true },
        });

        if (events.length === 0) {
            this.logger.debug(`No events found for tenant ${tenantId}, skipping location sync`);
            return;
        }

        this.logger.log(`Syncing locations for ${events.length} events (tenant ${tenantId})`);

        let totalUpserted = 0;

        for (const event of events) {
            try {
                let page = 1;
                let hasMore = true;

                while (hasMore) {
                    const response = await this.weezeventClient.getLocations(
                        tenantId,
                        organizationId,
                        event.weezeventId,
                        { page, perPage: 100 },
                    );

                    const locations = response.data;

                    for (const loc of locations) {
                        await this.prisma.weezeventLocation.upsert({
                            where: { weezeventId: String(loc.id) },
                            create: {
                                weezeventId: String(loc.id),
                                tenantId,
                                eventId: event.id,
                                name: loc.name || loc.public_name || `Location ${loc.id}`,
                                type: loc.type ?? null,
                                rawData: loc,
                                syncedAt: new Date(),
                            },
                            update: {
                                name: loc.name || loc.public_name || `Location ${loc.id}`,
                                type: loc.type ?? null,
                                rawData: loc,
                                syncedAt: new Date(),
                            },
                        });
                        totalUpserted++;
                    }

                    hasMore = response.meta.current_page < response.meta.total_pages;
                    page++;
                }
            } catch (err) {
                this.logger.warn(
                    `Failed to sync locations for event ${event.weezeventId}: ${(err as Error).message}`,
                );
            }
        }

        this.logger.log(`✅ Locations sync: upserted ${totalUpserted} locations for tenant ${tenantId}`);
    }
}
