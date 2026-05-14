import { Injectable, Logger } from '@nestjs/common';
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

                for (const apiTransaction of response.data) {
                    const rawTx = apiTransaction as any;

                    // ── Inline event upsert ─────────────────────────────────────────────
                    const eventWid = rawTx.event_id?.toString() ?? null;
                    const eventName = rawTx.event_name ?? null;
                    if (eventWid && eventName && !seenEventWids.has(eventWid)) {
                        seenEventWids.add(eventWid);
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
                                select: { id: true, weezeventId: true },
                            });
                            eventIdMap.set(eventWid, upsertedEvent.id);
                        } catch (err) {
                            this.logger.warn(
                                `Could not upsert event ${eventWid} from transaction ${apiTransaction.id}: ${(err as Error).message}`,
                            );
                        }
                    }

                    // ── Inline product upsert ───────────────────────────────────────────
                    for (const row of (apiTransaction.rows ?? [])) {
                        const rawRow = row as any;
                        const wid = String(row.item_id ?? '');
                        if (!wid || seenProductWids.has(wid)) continue;
                        seenProductWids.add(wid);
                        try {
                            const upserted = await this.prisma.weezeventProduct.upsert({
                                where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: wid } },
                                create: {
                                    weezeventId: wid,
                                    tenantId,
                                    integrationId,
                                    name: rawRow.item_name || `Item ${wid}`,
                                    basePrice: (row.unit_price ?? 0) / 100,
                                    vatRate: row.vat ?? null,
                                    rawData: rawRow,
                                    syncedAt: new Date(),
                                },
                                update: { syncedAt: new Date() },
                                select: { id: true, weezeventId: true },
                            });
                            productIdMap.set(wid, upserted.id);
                        } catch (err) {
                            this.logger.warn(
                                `Could not upsert product ${wid} from transaction ${apiTransaction.id}: ${(err as Error).message}`,
                            );
                        }
                    }

                    try {
                        const { created, updated } = await this.upsertTransaction(
                            tenantId,
                            integrationId,
                            apiTransaction,
                            productIdMap,
                            eventIdMap,
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
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
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
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
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
                sellerId: apiTransaction.seller_id?.toString(),
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
        // Delete existing items (cascade deletes payments)
        await this.prisma.weezeventTransactionItem.deleteMany({ where: { transactionId } });

        const itemsData = (rows ?? []).map(row => {
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

        await this.prisma.weezeventTransactionItem.createMany({ data: itemsData });

        const createdItems = await this.prisma.weezeventTransactionItem.findMany({
            where: { transactionId },
            select: { id: true, weezeventItemId: true },
        });
        const itemIdMap = new Map(createdItems.map(item => [item.weezeventItemId, item.id]));

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

        if (paymentsData.length > 0) {
            await this.prisma.weezeventPayment.createMany({ data: paymentsData });
        }
    }
}
