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
        organizationId: string,
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
            this.logger.log(
                `Starting transaction sync for tenant ${tenantId}, organization ${organizationId}`,
            );

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
                            apiTransaction,
                        );

                        result.itemsSynced++;
                        if (created) result.itemsCreated++;
                        if (updated) result.itemsUpdated++;
                    } catch (error) {
                        this.logger.error(
                            `Failed to sync transaction ${apiTransaction.id}`,
                            error.stack,
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

            return result;
        } catch (error) {
            this.logger.error('Transaction sync failed', error.stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync a single transaction
     */
    private async syncTransaction(
        tenantId: string,
        apiTransaction: ApiTransaction,
    ): Promise<{ created: boolean; updated: boolean }> {
        const weezeventId = apiTransaction.id.toString();

        // Check if transaction exists
        const existing = await this.prisma.weezeventTransaction.findUnique({
            where: { weezeventId },
        });

        // Calculate total amount from rows
        const totalAmount = apiTransaction.rows.reduce((sum, row) => {
            const rowTotal = row.payments.reduce(
                (rowSum, payment) => rowSum + payment.amount,
                0,
            );
            return sum + rowTotal;
        }, 0);

        // Upsert transaction
        const transaction = await this.prisma.weezeventTransaction.upsert({
            where: { weezeventId },
            create: {
                weezeventId,
                tenantId,
                amount: totalAmount,
                status: apiTransaction.status,
                transactionDate: new Date(apiTransaction.created),
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                sellerId: apiTransaction.seller_id?.toString(),
                sellerWalletId: apiTransaction.seller_wallet_id?.toString(),
                rawData: apiTransaction as any,
                syncedAt: new Date(),
            },
            update: {
                amount: totalAmount,
                status: apiTransaction.status,
                eventName: apiTransaction.event_name,
                merchantName: apiTransaction.fundation_name,
                locationName: apiTransaction.location_name,
                rawData: apiTransaction as any,
                syncedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Sync transaction items
        await this.syncTransactionItems(transaction.id, apiTransaction.rows);

        return {
            created: !existing,
            updated: !!existing,
        };
    }

    /**
     * Sync transaction items and payments
     */
    private async syncTransactionItems(
        transactionId: string,
        rows: ApiTransaction['rows'],
    ): Promise<void> {
        // Delete existing items (cascade will delete payments)
        await this.prisma.weezeventTransactionItem.deleteMany({
            where: { transactionId },
        });

        // Create new items
        for (const row of rows) {
            const item = await this.prisma.weezeventTransactionItem.create({
                data: {
                    transactionId,
                    weezeventItemId: row.id.toString(),
                    productName: `Item ${row.item_id}`,
                    compoundId: row.compound_id?.toString(),
                    quantity: 1,
                    unitPrice: row.unit_price,
                    vat: row.vat,
                    reduction: row.reduction || 0,
                    rawData: row as any,
                },
            });

            // Create payments for this item
            for (const payment of row.payments) {
                await this.prisma.weezeventPayment.create({
                    data: {
                        itemId: item.id,
                        weezeventPaymentId: payment.id.toString(),
                        walletId: payment.wallet_id?.toString(),
                        amount: payment.amount,
                        amountVat: payment.amount_vat,
                        currencyId: payment.currency_id?.toString(),
                        quantity: payment.quantity,
                        paymentMethodId: payment.payment_method_id?.toString(),
                        rawData: payment as any,
                    },
                });
            }
        }
    }

    /**
     * Sync a single wallet
     */
    async syncWallet(
        tenantId: string,
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

        return this.prisma.weezeventWallet.upsert({
            where: { weezeventId },
            create: {
                weezeventId,
                tenantId,
                balance: apiWallet.balance,
                currency: 'EUR', // Default
                userId: apiWallet.user_id?.toString(),
                walletGroupId: apiWallet.wallet_group_id?.toString(),
                status: apiWallet.status,
                cardNumber: apiWallet.metadata?.card_number,
                cardType: apiWallet.metadata?.card_type,
                rawData: apiWallet as any,
                syncedAt: new Date(),
            },
            update: {
                balance: apiWallet.balance,
                status: apiWallet.status,
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
            where: { weezeventId },
            create: {
                weezeventId,
                tenantId,
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
        organizationId: string,
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
            this.logger.log(`Syncing events for tenant ${tenantId}`);

            const response = await this.weezeventClient.getEvents(
                tenantId,
                organizationId,
                { perPage: 100 },
            );

            for (const apiEvent of response.data) {
                try {
                    const weezeventId = apiEvent.id.toString();
                    const existing = await this.prisma.weezeventEvent.findUnique({
                        where: { weezeventId },
                    });

                    await this.prisma.weezeventEvent.upsert({
                        where: { weezeventId },
                        create: {
                            weezeventId,
                            tenantId,
                            name: apiEvent.name,
                            organizationId,
                            startDate: new Date(apiEvent.start_date),
                            endDate: new Date(apiEvent.end_date),
                            description: apiEvent.description,
                            location: apiEvent.location,
                            capacity: apiEvent.capacity,
                            status: apiEvent.status,
                            metadata: apiEvent.metadata,
                            rawData: apiEvent as any,
                            syncedAt: new Date(),
                        },
                        update: {
                            name: apiEvent.name,
                            startDate: new Date(apiEvent.start_date),
                            endDate: new Date(apiEvent.end_date),
                            description: apiEvent.description,
                            location: apiEvent.location,
                            capacity: apiEvent.capacity,
                            status: apiEvent.status,
                            metadata: apiEvent.metadata,
                            rawData: apiEvent as any,
                            syncedAt: new Date(),
                            updatedAt: new Date(),
                        },
                    });

                    result.itemsSynced++;
                    if (!existing) result.itemsCreated++;
                    else result.itemsUpdated++;
                } catch (error) {
                    this.logger.error(`Failed to sync event ${apiEvent.id}`, error.stack);
                    result.errors++;
                }
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            return result;
        } catch (error) {
            this.logger.error('Events sync failed', error.stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    /**
     * Sync all products
     */
    async syncProducts(
        tenantId: string,
        organizationId: string,
    ): Promise<SyncResult> {
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
            this.logger.log(`Syncing products for tenant ${tenantId}`);

            const response = await this.weezeventClient.getProducts(
                tenantId,
                organizationId,
                { perPage: 100 },
            );

            for (const apiProduct of response.data) {
                try {
                    const weezeventId = apiProduct.id.toString();
                    const existing = await this.prisma.weezeventProduct.findUnique({
                        where: { weezeventId },
                    });

                    await this.prisma.weezeventProduct.upsert({
                        where: { weezeventId },
                        create: {
                            weezeventId,
                            tenantId,
                            name: apiProduct.name,
                            description: apiProduct.description,
                            category: apiProduct.category,
                            basePrice: apiProduct.base_price,
                            vatRate: apiProduct.vat_rate,
                            image: apiProduct.image,
                            allergens: apiProduct.allergens || [],
                            components: apiProduct.components,
                            variants: apiProduct.variants,
                            metadata: apiProduct.metadata,
                            rawData: apiProduct as any,
                            syncedAt: new Date(),
                        },
                        update: {
                            name: apiProduct.name,
                            description: apiProduct.description,
                            category: apiProduct.category,
                            basePrice: apiProduct.base_price,
                            vatRate: apiProduct.vat_rate,
                            image: apiProduct.image,
                            allergens: apiProduct.allergens || [],
                            components: apiProduct.components,
                            variants: apiProduct.variants,
                            metadata: apiProduct.metadata,
                            rawData: apiProduct as any,
                            syncedAt: new Date(),
                            updatedAt: new Date(),
                        },
                    });

                    result.itemsSynced++;
                    if (!existing) result.itemsCreated++;
                    else result.itemsUpdated++;
                } catch (error) {
                    this.logger.error(
                        `Failed to sync product ${apiProduct.id}`,
                        error.stack,
                    );
                    result.errors++;
                }
            }

            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            return result;
        } catch (error) {
            this.logger.error('Products sync failed', error.stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }
}
