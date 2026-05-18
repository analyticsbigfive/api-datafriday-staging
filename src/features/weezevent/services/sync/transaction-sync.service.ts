import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import {
    WeezeventTransaction as ApiTransaction,
} from '../../interfaces/weezevent-entities.interface';
import { SyncResult, SyncTransactionsOptions } from '../weezevent-sync.service';

/**
 * WeezeventTransactionSyncService
 *
 * SRP: owns the full transaction sync pipeline.
 * Transactions are the single source of truth — events, products, and locations
 * are extracted inline from transaction data, so no prior catalog sync is required.
 */
@Injectable()
export class WeezeventTransactionSyncService {
    private readonly logger = new Logger(WeezeventTransactionSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    /**
     * Bulk-sync transactions from the Weezevent API.
     * Upserts events, products, and locations inline from each transaction row,
     * so the caller does not need to run syncEvents() or syncProducts() first.
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

            // Build weezeventId → CUID maps once for the whole sync.
            const [allProducts, allEvents] = await Promise.all([
                this.prisma.weezeventProduct.findMany({
                    where: { tenantId, integrationId },
                    select: { id: true, weezeventId: true },
                }),
                this.prisma.weezeventEvent.findMany({
                    where: { tenantId, integrationId },
                    select: { id: true, weezeventId: true },
                }),
            ]);
            const productIdMap = new Map(allProducts.map(p => [p.weezeventId, p.id]));
            const eventIdMap = new Map(allEvents.map(e => [e.weezeventId, e.id]));
            this.logger.log(`Maps loaded — products: ${productIdMap.size}, events: ${eventIdMap.size}`);

            // Track wids already seen this run to avoid redundant upserts.
            const seenProductWids = new Set<string>(productIdMap.keys());
            const seenEventWids = new Set<string>(eventIdMap.keys());
            const seenLocationWids = new Set<string>();
            const locationIdMap = new Map<string, string>(); // weezeventId -> DB id

            let page = 1;
            let hasMore = true;

            while (hasMore) {
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

                const now = new Date();

                // ── 1. Batch-collect new events, products, locations from this page ──
                const newEventEntries = new Map<string, string>();
                const newProductEntries = new Map<string, any>();
                const newLocationEntries = new Map<string, string>();
                for (const apiTx of response.data) {
                    const rawTx = apiTx as any;
                    const eventWid = rawTx.event_id?.toString() ?? null;
                    const eventName = rawTx.event_name ?? null;
                    if (eventWid && eventName && !seenEventWids.has(eventWid)) {
                        seenEventWids.add(eventWid);
                        newEventEntries.set(eventWid, eventName);
                    }
                    const locWid = rawTx.location_id?.toString() ?? null;
                    const locName = (apiTx.location_name ?? rawTx.location_name) ?? null;
                    if (locWid && locName && !seenLocationWids.has(locWid)) {
                        seenLocationWids.add(locWid);
                        newLocationEntries.set(locWid, locName);
                    }
                    for (const row of (apiTx.rows ?? [])) {
                        const wid = String((row as any).item_id ?? '');
                        if (!wid || seenProductWids.has(wid)) continue;
                        seenProductWids.add(wid);
                        newProductEntries.set(wid, row);
                    }
                }

                // ── 2. Batch-create new events / locations / products ─────────────
                if (newEventEntries.size > 0) {
                    await this.prisma.weezeventEvent.createMany({
                        data: [...newEventEntries.entries()].map(([wid, name]) => ({
                            weezeventId: wid, tenantId, integrationId, name, organizationId, rawData: {}, syncedAt: now,
                        })),
                        skipDuplicates: true,
                    });
                    const fetched = await this.prisma.weezeventEvent.findMany({
                        where: { tenantId, integrationId, weezeventId: { in: [...newEventEntries.keys()] } },
                        select: { id: true, weezeventId: true },
                    });
                    fetched.forEach(e => eventIdMap.set(e.weezeventId, e.id));
                }

                if (newLocationEntries.size > 0) {
                    await this.prisma.weezeventLocation.createMany({
                        data: [...newLocationEntries.entries()].map(([wid, name]) => ({
                            weezeventId: wid, tenantId, integrationId, name, rawData: {}, syncedAt: now,
                        })),
                        skipDuplicates: true,
                    });
                    const fetched = await this.prisma.weezeventLocation.findMany({
                        where: { tenantId, integrationId, weezeventId: { in: [...newLocationEntries.keys()] } },
                        select: { id: true, weezeventId: true },
                    });
                    fetched.forEach(l => locationIdMap.set(l.weezeventId, l.id));
                }

                if (newProductEntries.size > 0) {
                    await this.prisma.weezeventProduct.createMany({
                        data: [...newProductEntries.entries()].map(([wid, row]) => ({
                            weezeventId: wid, tenantId, integrationId,
                            name: (row as any).item_name || `Item ${wid}`,
                            basePrice: ((row as any).unit_price ?? 0) / 100,
                            vatRate: (row as any).vat ?? null,
                            rawData: row as any,
                            syncedAt: now,
                        })),
                        skipDuplicates: true,
                    });
                    const fetched = await this.prisma.weezeventProduct.findMany({
                        where: { tenantId, integrationId, weezeventId: { in: [...newProductEntries.keys()] } },
                        select: { id: true, weezeventId: true },
                    });
                    fetched.forEach(p => productIdMap.set(p.weezeventId, p.id));
                }

                // ── 3. Batch-insert transactions for this page ───────────────────
                // Pre-generate IDs client-side so we can identify which rows are new
                // after createMany(skipDuplicates) — new rows keep the client ID.
                const pageTxData = response.data.map(apiTx => {
                    const rawTx = apiTx as any;
                    const rows = apiTx.rows ?? [];
                    const totalAmount = rows.reduce((sum: number, row: any) =>
                        sum + (row.payments ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0), 0) / 100;
                    const status = apiTx.status as any;
                    const statusValue = typeof status === 'object' && status?.name
                        ? status.name : typeof status === 'string' ? status : 'unknown';
                    const dateStr = rawTx.created || rawTx.updated || rawTx.validated || rawTx.date || rawTx.created_at;
                    const eventWid = rawTx.event_id?.toString() ?? null;
                    const locWid = rawTx.location_id?.toString() ?? null;
                    return {
                        id: nanoid(),
                        weezeventId: apiTx.id.toString(),
                        tenantId,
                        integrationId,
                        amount: totalAmount,
                        status: statusValue,
                        transactionDate: dateStr ? new Date(dateStr) : now,
                        eventId: eventWid ? (eventIdMap.get(eventWid) ?? null) : null,
                        eventName: apiTx.event_name ?? null,
                        merchantName: rawTx.fundation_name ?? null,
                        locationName: apiTx.location_name ?? null,
                        locationId: locWid ? (locationIdMap.get(locWid) ?? null) : null,
                        sellerWalletId: rawTx.seller_wallet_id?.toString() ?? null,
                        rawData: apiTx as any,
                        syncedAt: now,
                    };
                });

                const clientIdByWid = new Map(pageTxData.map(t => [t.weezeventId, t.id]));

                await this.prisma.weezeventTransaction.createMany({ data: pageTxData, skipDuplicates: true });

                // Fetch actual DB IDs (existing rows keep old IDs, new rows have client-generated IDs)
                const dbTxs = await this.prisma.weezeventTransaction.findMany({
                    where: { tenantId, weezeventId: { in: pageTxData.map(t => t.weezeventId) } },
                    select: { id: true, weezeventId: true },
                });
                const txIdMap = new Map(dbTxs.map(t => [t.weezeventId, t.id]));

                // A row is "new" when the DB returned the same ID we generated (it was actually inserted)
                const newWids = new Set(dbTxs.filter(t => t.id === clientIdByWid.get(t.weezeventId)).map(t => t.weezeventId));
                result.itemsSynced += response.data.length;
                result.itemsCreated += newWids.size;
                result.itemsUpdated += response.data.length - newWids.size;

                // ── 4. Batch-insert items + payments for NEW transactions only ────
                // Existing transactions already have their items from a previous sync.
                const allItems: any[] = [];
                const allPayments: any[] = [];
                for (const apiTx of response.data) {
                    if (!newWids.has(apiTx.id.toString())) continue;
                    const txDbId = txIdMap.get(apiTx.id.toString());
                    if (!txDbId) continue;
                    for (const row of (apiTx.rows ?? [])) {
                        const itemId = nanoid();
                        const totalQty = (row.payments ?? []).reduce((s: number, p: any) => s + (p.quantity ?? 0), 0);
                        allItems.push({
                            id: itemId,
                            transactionId: txDbId,
                            weezeventItemId: row.id.toString(),
                            productName: (row as any).item_name || `Item ${row.item_id}`,
                            productId: productIdMap.get(String(row.item_id)) ?? null,
                            compoundId: row.compound_id?.toString() || null,
                            quantity: totalQty || 1,
                            unitPrice: (row.unit_price || 0) / 100,
                            vat: row.vat || 0,
                            reduction: row.reduction || 0,
                            rawData: row as any,
                        });
                        for (const payment of (row.payments ?? [])) {
                            allPayments.push({
                                id: nanoid(),
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
                }

                await Promise.all([
                    allItems.length > 0 ? this.prisma.weezeventTransactionItem.createMany({ data: allItems }) : Promise.resolve(),
                    allPayments.length > 0 ? this.prisma.weezeventPayment.createMany({ data: allPayments }) : Promise.resolve(),
                ]);

                this.logger.debug(`Page ${page}: ${newWids.size} new / ${response.data.length - newWids.size} existing — ${allItems.length} items, ${allPayments.length} payments`);

                hasMore = page < response.meta.total_pages;
                page++;
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `Transaction sync completed: ${result.itemsSynced} synced (${result.itemsCreated} created, ${result.itemsUpdated} updated), ${result.errors} errors in ${result.duration}ms`,
            );

            return result;
        } catch (error) {
            this.logger.error('Transaction sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync a single transaction by ID — for webhook-triggered syncs.
     * Builds entity maps from DB and upserts event/products inline before persisting,
     * so eventId and productId FKs are always set correctly.
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

        const apiTransaction = await this.weezeventClient.getTransaction(
            tenantId,
            organizationId,
            transactionId.toString(),
        );

        const rawTx = apiTransaction as any;

        // Build entity maps from DB so eventId and productId FKs are resolved correctly
        const [allProducts, allEvents] = await Promise.all([
            this.prisma.weezeventProduct.findMany({
                where: { tenantId, integrationId },
                select: { id: true, weezeventId: true },
            }),
            this.prisma.weezeventEvent.findMany({
                where: { tenantId, integrationId },
                select: { id: true, weezeventId: true },
            }),
        ]);
        const productIdMap = new Map(allProducts.map(p => [p.weezeventId, p.id]));
        const eventIdMap = new Map(allEvents.map(e => [e.weezeventId, e.id]));

        // Upsert event inline
        const eventWid = rawTx.event_id?.toString() ?? null;
        const eventName = rawTx.event_name ?? null;
        if (eventWid && eventName && !eventIdMap.has(eventWid)) {
            try {
                const upsertedEvent = await this.prisma.weezeventEvent.upsert({
                    where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: eventWid } },
                    create: {
                        weezeventId: eventWid,
                        tenantId,
                        integrationId,
                        name: eventName,
                        organizationId,
                        rawData: {},
                        syncedAt: new Date(),
                    },
                    update: { syncedAt: new Date() },
                    select: { id: true },
                });
                eventIdMap.set(eventWid, upsertedEvent.id);
            } catch (err) {
                this.logger.warn(
                    `Could not upsert event ${eventWid} from webhook transaction ${transactionId}: ${(err as Error).message}`,
                );
            }
        }

        // Upsert products inline
        for (const row of (apiTransaction.rows ?? [])) {
            const wid = String(row.item_id ?? '');
            if (!wid || productIdMap.has(wid)) continue;
            try {
                const upserted = await this.prisma.weezeventProduct.upsert({
                    where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: wid } },
                    create: {
                        weezeventId: wid,
                        tenantId,
                        integrationId,
                        name: (row as any).item_name || `Item ${wid}`,
                        basePrice: (row.unit_price ?? 0) / 100,
                        vatRate: (row as any).vat ?? null,
                        rawData: row as any,
                        syncedAt: new Date(),
                    },
                    update: { syncedAt: new Date() },
                    select: { id: true },
                });
                productIdMap.set(wid, upserted.id);
            } catch (err) {
                this.logger.warn(
                    `Could not upsert product ${wid} from webhook transaction ${transactionId}: ${(err as Error).message}`,
                );
            }
        }

        return this.upsertTransaction(tenantId, integrationId, apiTransaction, productIdMap, eventIdMap);
    }

    // ─────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────

    private async upsertTransaction(
        tenantId: string,
        integrationId: string,
        apiTransaction: ApiTransaction,
        productIdMap: Map<string, string>,
        eventIdMap: Map<string, string>,
    ): Promise<{ created: boolean; updated: boolean }> {
        const weezeventId = apiTransaction.id.toString();

        const existing = await this.prisma.weezeventTransaction.findUnique({
            where: { tenantId_weezeventId: { tenantId, weezeventId } },
        });

        // Calculate total amount from rows[].payments[].amount (centimes → euros)
        const txRows = apiTransaction.rows ?? [];
        const totalAmount = txRows.reduce((sum, row) => {
            return sum + (row.payments ?? []).reduce(
                (rowSum, payment) => rowSum + (payment.amount ?? 0),
                0,
            );
        }, 0) / 100;

        // Extract status as string (API may return object with name)
        const transactionStatus = apiTransaction.status as any;
        const statusValue = typeof transactionStatus === 'object' && transactionStatus?.name
            ? transactionStatus.name
            : (typeof transactionStatus === 'string' ? transactionStatus : 'unknown');

        // Parse transaction date — try multiple field names
        const rawTx = apiTransaction as any;
        const dateStr = rawTx.created || rawTx.updated || rawTx.validated || rawTx.date || rawTx.created_at;
        if (!dateStr) {
            this.logger.warn(`Transaction ${weezeventId} has no date field. Keys: ${Object.keys(rawTx).join(', ')}`);
        }
        const transactionDate = dateStr ? new Date(dateStr) : new Date();

        // Resolve FK IDs
        const eventWid = rawTx.event_id?.toString() ?? null;
        const eventDbId = eventWid ? (eventIdMap.get(eventWid) ?? null) : null;

        // Upsert location inline
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
                update: { name: locationName, syncedAt: new Date() },
                select: { id: true },
            });
            locationDbId = loc.id;
        }

        const transaction = await this.prisma.weezeventTransaction.upsert({
            where: { tenantId_weezeventId: { tenantId, weezeventId } },
            create: {
                weezeventId,
                tenantId,
                integrationId,
                amount: totalAmount,
                status: statusValue,
                transactionDate,
                eventId: eventDbId,
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                locationId: locationDbId,
                sellerWalletId: apiTransaction.seller_wallet_id?.toString(),
                rawData: apiTransaction as any,
                syncedAt: new Date(),
            },
            update: {
                amount: totalAmount,
                status: statusValue,
                eventId: eventDbId,
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                locationId: locationDbId,
                rawData: apiTransaction as any,
                syncedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        await this.upsertTransactionItems(transaction.id, apiTransaction.rows, productIdMap);

        return { created: !existing, updated: !!existing };
    }

    private async upsertTransactionItems(
        transactionId: string,
        rows: ApiTransaction['rows'],
        productIdMap: Map<string, string>,
    ): Promise<void> {
        // Generate item IDs client-side to avoid a SELECT round-trip after INSERT.
        const itemsData = (rows ?? []).map(row => {
            const totalQty = (row.payments ?? []).reduce((s: number, p: any) => s + (p.quantity ?? 0), 0);
            return {
                id: nanoid(),
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

        // Build the itemId map from client-side IDs — no DB round-trip needed.
        const itemIdMap = new Map(itemsData.map(item => [item.weezeventItemId, item.id]));

        const paymentsData: any[] = [];
        for (const row of (rows ?? [])) {
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

        // Batch all 3 write operations in a single DB transaction (1 BEGIN / 1 COMMIT).
        await this.prisma.$transaction([
            this.prisma.weezeventTransactionItem.deleteMany({ where: { transactionId } }),
            this.prisma.weezeventTransactionItem.createMany({ data: itemsData }),
            ...(paymentsData.length > 0
                ? [this.prisma.weezeventPayment.createMany({ data: paymentsData })]
                : []),
        ]);
    }
}
