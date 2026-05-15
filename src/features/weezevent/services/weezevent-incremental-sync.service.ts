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
        integrationId: string,
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
            // 1. Get integration config
            const integration = await this.getIntegrationConfig(tenantId, integrationId);
            const organizationId = integration.organizationId!;

            // 2. Get sync state (last sync info)
            const syncState = await this.getSyncState(tenantId, integrationId, syncType);
            
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
            const existingEventsMap = await this.getExistingEventsMap(tenantId, integrationId);

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
                    integrationId,
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
            await this.updateSyncState(tenantId, integrationId, syncType, {
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

            // 9. Sync locations for all events of this tenant (fire-and-forget — truly non-blocking)
            this.syncLocationsFromApi(tenantId, integrationId, organizationId).catch(locErr => {
                this.logger.warn(`Locations sync failed (non-blocking): ${(locErr as Error).message}`);
            });

            return result;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Events sync failed', err.stack);

            // Update error state
            await this.updateSyncStateError(tenantId, integrationId, syncType, err.message);

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
        integrationId: string,
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
            const integration = await this.getIntegrationConfig(tenantId, integrationId);
            const organizationId = integration.organizationId!;

            const syncState = await this.getSyncState(tenantId, integrationId, syncType);
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
            const existingIds = await this.getExistingTransactionIds(tenantId, integrationId, fromDate);

            let page = 1;
            let hasMore = true;
            let totalProcessed = 0;
            const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;
            // No maxItems cap: fetch ALL pages until Weezevent says there are no more.
            // The frontend should call this once and wait — no outer retry loop needed.
            const MAX_PAGES_SAFETY = 10000; // absolute safeguard (~5M transactions)

            while (hasMore && page <= MAX_PAGES_SAFETY) {
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

                // If all transactions on this page were already in DB, the API's from_date
                // filter is not being honoured (Weezevent returns all historical pages).
                // Stop early — no point fetching further pages of already-known data.
                if (useIncremental && newTransactions.length === 0) {
                    this.logger.debug(`Incremental: full page skipped (all already in DB) — stopping early at page ${page}`);
                    hasMore = false;
                    break;
                }

                if (newTransactions.length > 0) {
                    // Batch upsert
                    const batchResult = await this.processBatchTransactions(
                        tenantId,
                        integrationId,
                        organizationId,
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

                // Report progress: estimate via items processed vs a typical large dataset
                if (options.onProgress) {
                    const totalPages = response.meta.total_pages || 1;
                    const donePct = Math.min(95, Math.round((page / totalPages) * 100));
                    await options.onProgress(donePct).catch(() => {});
                }

                page++;

                this.logger.debug(
                    `Processed page ${page - 1}: ${transactions.length} transactions (${newTransactions.length} new)`,
                );
            }

            result.itemsSynced = result.itemsCreated + result.itemsUpdated;
            result.hasMore = hasMore;

            // Update sync state
            await this.updateSyncState(tenantId, integrationId, syncType, {
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
            await this.updateSyncStateError(tenantId, integrationId, syncType, err.message);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Get integration config with validation
     */
    private async getIntegrationConfig(tenantId: string, integrationId: string) {
        const integration = await this.prisma.weezeventIntegration.findFirst({
            where: { id: integrationId, tenantId, enabled: true },
            select: {
                id: true,
                organizationId: true,
                enabled: true,
            },
        });

        if (!integration) {
            throw new Error(`Weezevent integration ${integrationId} not found or disabled for tenant ${tenantId}`);
        }

        if (!integration.organizationId) {
            throw new Error(`Weezevent organizationId not configured for integration ${integrationId}`);
        }

        return integration;
    }

    /**
     * Get sync state from database
     */
    private async getSyncState(tenantId: string, integrationId: string, syncType: string): Promise<SyncState> {
        const state = await this.prisma.weezeventSyncState.findUnique({
            where: {
                tenantId_integrationId_syncType: { tenantId, integrationId, syncType },
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
        integrationId: string,
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
                tenantId_integrationId_syncType: { tenantId, integrationId, syncType },
            },
            create: {
                tenantId,
                integrationId,
                syncType,
                ...data,
            },
            update: data,
        });
    }

    /**
     * Update sync state on error
     */
    private async updateSyncStateError(tenantId: string, integrationId: string, syncType: string, error: string) {
        const current = await this.prisma.weezeventSyncState.findUnique({
            where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType } },
        });

        await this.prisma.weezeventSyncState.upsert({
            where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType } },
            create: {
                tenantId,
                integrationId,
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
    private async getExistingEventsMap(tenantId: string, integrationId: string): Promise<Map<string, { syncedAt: Date }>> {
        const events = await this.prisma.weezeventEvent.findMany({
            where: { tenantId, integrationId },
            select: { weezeventId: true, syncedAt: true },
        });

        return new Map(events.map(e => [e.weezeventId, { syncedAt: e.syncedAt }]));
    }

    /**
     * Get existing transaction IDs as a Set for O(1) lookup
     * Only fetch IDs for transactions after fromDate to limit memory
     */
    private async getExistingTransactionIds(tenantId: string, integrationId: string, _fromDate: Date | null): Promise<Set<string>> {
        // Load ALL existing IDs for this integration — no date filter.
        // Filtering by transactionDate (the historical purchase date, e.g. 2019) would cause
        // all historical records to appear as "new" on every incremental run, leading to an
        // infinite re-insert loop with createMany(skipDuplicates: true) silently returning 0.
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where: { tenantId, integrationId },
            select: { weezeventId: true },
        });

        return new Set(transactions.map(t => t.weezeventId));
    }

    /**
     * Process batch of events with optimized upserts
     */
    private async processBatchEvents(
        tenantId: string,
        integrationId: string,
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
                        integrationId,
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
            const createResult = await this.prisma.weezeventEvent.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = createResult.count;
        }

        // Batch update in chunked transactions to avoid saturating the connection pool
        const UPDATE_CHUNK_SIZE = 10;
        for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
            const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
            await this.prisma.$transaction(
                chunk.map(({ weezeventId, data }) =>
                    this.prisma.weezeventEvent.update({
                        where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                        data,
                    })
                )
            );
        }
        result.updated = toUpdate.length;

        return result;
    }

    /**
     * Process batch of transactions with optimized upserts.
     * Inline-upserts events, locations, and products extracted from the raw
     * transaction data, then bulk-creates transaction records plus their
     * items (rows) and payments.
     */
    private async processBatchTransactions(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        transactions: any[],
        existingIds: Set<string>,
    ): Promise<{ created: number; updated: number; errors: number }> {
        const result = { created: 0, updated: 0, errors: 0 };

        // ── 1. Inline-upsert events extracted from transaction data ──────────
        const uniqueEventEntries = [
            ...new Map(
                transactions
                    .filter(t => t.event_id && t.event_name)
                    .map(t => [String(t.event_id), { wid: String(t.event_id), name: t.event_name as string }]),
            ).values(),
        ];

        // Batch upsert events: createMany (skip duplicates) then fetch all IDs in one query
        const eventIdMap = new Map<string, string>();
        if (uniqueEventEntries.length > 0) {
            const now = new Date();
            await this.prisma.weezeventEvent.createMany({
                data: uniqueEventEntries.map(({ wid, name }) => ({
                    weezeventId: wid, tenantId, integrationId, name, organizationId, rawData: {}, syncedAt: now,
                })),
                skipDuplicates: true,
            });
            const existingEvents = await this.prisma.weezeventEvent.findMany({
                where: { tenantId, integrationId, weezeventId: { in: uniqueEventEntries.map(e => e.wid) } },
                select: { id: true, weezeventId: true },
            });
            existingEvents.forEach(e => eventIdMap.set(e.weezeventId, e.id));
        }

        // ── 2. Inline-upsert products from transaction rows ──────────────────
        const allRows: any[] = transactions.flatMap(t => t.rows ?? []);
        const uniqueProductEntries = [
            ...new Map(
                allRows
                    .filter(r => r.item_id)
                    .map(r => [String(r.item_id), { wid: String(r.item_id), name: (r.item_name as string) || `Item ${r.item_id}`, price: r.unit_price ?? 0, vat: r.vat ?? null, raw: r }]),
            ).values(),
        ];

        // Batch upsert products: createMany (skip duplicates) then fetch all IDs in one query
        const productIdMap = new Map<string, string>();
        if (uniqueProductEntries.length > 0) {
            const now = new Date();
            await this.prisma.weezeventProduct.createMany({
                data: uniqueProductEntries.map(({ wid, name, price, vat, raw }) => ({
                    weezeventId: wid, tenantId, integrationId, name,
                    basePrice: price / 100, vatRate: vat, rawData: raw, syncedAt: now,
                })),
                skipDuplicates: true,
            });
            const existingProducts = await this.prisma.weezeventProduct.findMany({
                where: { tenantId, integrationId, weezeventId: { in: uniqueProductEntries.map(p => p.wid) } },
                select: { id: true, weezeventId: true },
            });
            existingProducts.forEach(p => productIdMap.set(p.weezeventId, p.id));
        }

        // ── 3. Inline-upsert locations extracted from transaction data ────────
        const uniqueLocationEntries = [
            ...new Map(
                transactions
                    .filter(t => t.location_id && t.location_name)
                    .map(t => [String(t.location_id), { wid: String(t.location_id), name: t.location_name as string }]),
            ).values(),
        ];

        // Batch upsert locations: createMany (skip duplicates) then fetch all IDs in one query
        const locationIdMap = new Map<string, string>();
        if (uniqueLocationEntries.length > 0) {
            const now = new Date();
            await this.prisma.weezeventLocation.createMany({
                data: uniqueLocationEntries.map(({ wid, name }) => ({
                    weezeventId: wid, tenantId, integrationId, name, rawData: {}, syncedAt: now,
                })),
                skipDuplicates: true,
            });
            const existingLocations = await this.prisma.weezeventLocation.findMany({
                where: { tenantId, integrationId, weezeventId: { in: uniqueLocationEntries.map(l => l.wid) } },
                select: { id: true, weezeventId: true },
            });
            existingLocations.forEach(l => locationIdMap.set(l.weezeventId, l.id));
        }

        // ── 4. Inline-upsert merchants (fundations) from transaction data ────
        // Weezevent API field: fundation_id / fundation_name (not merchant_id)
        const uniqueMerchantEntries = [
            ...new Map(
                transactions
                    .filter(t => t.fundation_id && t.fundation_name)
                    .map(t => [String(t.fundation_id), { wid: String(t.fundation_id), name: t.fundation_name as string }]),
            ).values(),
        ];

        // Batch upsert merchants: createMany (skip duplicates) then fetch all IDs in one query
        const merchantIdMap = new Map<string, string>();
        if (uniqueMerchantEntries.length > 0) {
            const now = new Date();
            await this.prisma.weezeventMerchant.createMany({
                data: uniqueMerchantEntries.map(({ wid, name }) => ({
                    weezeventId: wid, tenantId, integrationId, name, organizationId, rawData: {}, syncedAt: now,
                })),
                skipDuplicates: true,
            });
            const existingMerchants = await this.prisma.weezeventMerchant.findMany({
                where: { tenantId, integrationId, weezeventId: { in: uniqueMerchantEntries.map(m => m.wid) } },
                select: { id: true, weezeventId: true },
            });
            existingMerchants.forEach(m => merchantIdMap.set(m.weezeventId, m.id));
        }

        // ── 5. Build transaction records ─────────────────────────────────────
        const toCreate: any[] = [];
        const newTxRawMap = new Map<string, any>(); // weezeventId -> raw api transaction

        for (const apiTransaction of transactions) {
            try {
                const weezeventId = apiTransaction.id.toString();
                const isNew = !existingIds.has(weezeventId);

                const transactionStatus = apiTransaction.status as any;
                const statusValue = typeof transactionStatus === 'object' && transactionStatus?.name
                    ? transactionStatus.name
                    : (typeof transactionStatus === 'string' ? transactionStatus : 'unknown');

                const rawTx = apiTransaction as any;
                const dateStr = rawTx.created || rawTx.updated || rawTx.validated || rawTx.date || rawTx.created_at;
                if (!dateStr) {
                    this.logger.warn(`Transaction ${weezeventId} has no date field. Keys: ${Object.keys(rawTx).join(', ')}`);
                }
                const transactionDate = dateStr ? new Date(dateStr) : new Date();

                const resolvedEventId = apiTransaction.event_id
                    ? (eventIdMap.get(String(apiTransaction.event_id)) ?? null)
                    : null;
                const resolvedLocationId = apiTransaction.location_id
                    ? (locationIdMap.get(String(apiTransaction.location_id)) ?? null)
                    : null;
                // Weezevent uses fundation_id/fundation_name for merchant
                const resolvedMerchantId = rawTx.fundation_id
                    ? (merchantIdMap.get(String(rawTx.fundation_id)) ?? null)
                    : null;

                const txRows: any[] = rawTx.rows ?? [];
                const computedAmount = txRows.reduce((sum: number, row: any) =>
                    sum + (row.payments ?? []).reduce((rowSum: number, p: any) => rowSum + (p.amount ?? 0), 0), 0) / 100;

                if (isNew) {
                    toCreate.push({
                        weezeventId,
                        tenantId,
                        integrationId,
                        amount: computedAmount,
                        status: statusValue,
                        transactionDate,
                        eventId: resolvedEventId,
                        eventName: apiTransaction.event_name,
                        merchantId: resolvedMerchantId,
                        merchantName: rawTx.fundation_name ?? null,
                        locationId: resolvedLocationId,
                        locationName: apiTransaction.location_name,
                        sellerId: apiTransaction.seller_id?.toString(),
                        rawData: apiTransaction as any,
                        syncedAt: new Date(),
                    });
                    newTxRawMap.set(weezeventId, apiTransaction);
                }
            } catch (error) {
                this.logger.error(`Failed to process transaction ${apiTransaction.id}`, error);
                result.errors++;
            }
        }

        // ── 6. Bulk-create transactions ───────────────────────────────────────
        if (toCreate.length > 0) {
            const createResult = await this.prisma.weezeventTransaction.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = createResult.count;

            // ── 7. Create transaction items and payments for new records ───────
            const createdTxs = await this.prisma.weezeventTransaction.findMany({
                where: { tenantId, integrationId, weezeventId: { in: toCreate.map(t => t.weezeventId) } },
                select: { id: true, weezeventId: true },
            });

            for (const tx of createdTxs) {
                const raw = newTxRawMap.get(tx.weezeventId);
                if (!raw) continue;
                await this.createTransactionItemsAndPayments(tx.id, raw.rows ?? [], productIdMap);
            }
        }

        return result;
    }

    /**
     * Bulk-create transaction items (rows) and their payments for a given transaction.
     * Called after the parent WeezeventTransaction row is persisted.
     */
    private async createTransactionItemsAndPayments(
        transactionId: string,
        rows: any[],
        productIdMap: Map<string, string>,
    ): Promise<void> {
        if (rows.length === 0) return;

        const itemsData = rows.map(row => {
            const totalQty = (row.payments ?? []).reduce((s: number, p: any) => s + (p.quantity ?? 0), 0);
            return {
                transactionId,
                weezeventItemId: row.id.toString(),
                productName: row.item_name || `Item ${row.item_id}`,
                productId: productIdMap.get(String(row.item_id)) ?? null,
                compoundId: row.compound_id?.toString() || null,
                quantity: totalQty || 1,
                unitPrice: (row.unit_price || 0) / 100,
                vat: row.vat || 0,
                reduction: row.reduction || 0,
                rawData: row,
            };
        });

        await this.prisma.weezeventTransactionItem.createMany({ data: itemsData, skipDuplicates: true });

        const createdItems = await this.prisma.weezeventTransactionItem.findMany({
            where: { transactionId },
            select: { id: true, weezeventItemId: true },
        });
        const itemIdMap = new Map(createdItems.map(item => [item.weezeventItemId, item.id]));

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
                    rawData: payment,
                });
            }
        }

        if (paymentsData.length > 0) {
            await this.prisma.weezeventPayment.createMany({ data: paymentsData, skipDuplicates: true });
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Run async tasks over an array with a maximum concurrency to avoid saturating
     * the Prisma connection pool.
     *
     * Default concurrency = 1 (sequential) so that background sync jobs never
     * hold more than one connection at a time and leave room for user-facing
     * queries. Callers that own their own idle context (e.g. unit tests) may
     * pass a higher value explicitly.
     *
     * Each item is retried up to 3 times on transient pool / connection errors
     * with exponential back-off (200 ms, 400 ms, 800 ms).
     */
    private async runConcurrent<T>(
        items: T[],
        fn: (item: T) => Promise<void>,
        concurrency = 1,
    ): Promise<void> {
        const TRANSIENT_PATTERNS = [
            'timed out fetching a new connection',
            'server has closed the connection',
            'connection pool timeout',
            'connection reset',
        ];
        const isTransient = (err: unknown): boolean => {
            const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
            return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
        };
        const withRetry = async (item: T): Promise<void> => {
            const MAX_ATTEMPTS = 3;
            let delay = 200;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    return await fn(item);
                } catch (err) {
                    if (attempt < MAX_ATTEMPTS && isTransient(err)) {
                        this.logger.warn(
                            `runConcurrent: transient error on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${delay}ms — ${err instanceof Error ? err.message : err}`,
                        );
                        await new Promise((r) => setTimeout(r, delay));
                        delay *= 2;
                    } else {
                        throw err;
                    }
                }
            }
        };
        for (let i = 0; i < items.length; i += concurrency) {
            await Promise.all(items.slice(i, i + concurrency).map(withRetry));
        }
    }

    /**
     * Get sync status for a tenant
     */
    async getSyncStatus(tenantId: string, integrationId?: string) {
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;

        const states = await this.prisma.weezeventSyncState.findMany({ where });

        return states.reduce((acc, state) => {
            const key = integrationId ? state.syncType : `${state.integrationId}:${state.syncType}`;
            acc[key] = {
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
    async resetSyncState(tenantId: string, integrationId?: string, syncType?: string) {
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (syncType) where.syncType = syncType;

        await this.prisma.weezeventSyncState.deleteMany({ where });

        this.logger.log(`Reset sync state for tenant ${tenantId}${integrationId ? ` (integration: ${integrationId})` : ''}${syncType ? ` (type: ${syncType})` : ''}`);
    }

    // ==================== LOCATIONS SYNC ====================

    /**
     * Sync locations directly from WeezPay API for all events of this tenant.
     * Called at the end of syncEventsIncremental (non-blocking).
     */
    private async syncLocationsFromApi(tenantId: string, integrationId: string, organizationId: string): Promise<void> {
        const events = await this.prisma.weezeventEvent.findMany({
            where: { tenantId, integrationId },
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
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: String(loc.id) } },
                            create: {
                                weezeventId: String(loc.id),
                                tenantId,
                                integrationId,
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
