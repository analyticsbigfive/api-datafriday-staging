import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import {
    WeezeventWallet as ApiWallet,
    WeezeventUser as ApiUser,
} from '../../interfaces/weezevent-entities.interface';
import { SyncResult } from '../weezevent-sync.service';

/**
 * WeezeventQueuedEntitySyncService
 *
 * SRP: owns entity syncs that are dispatched via BullMQ jobs or webhook callbacks.
 * - syncOrders / syncPrices / syncAttendees  → called from data-sync.processor
 * - syncWallet / syncUser                    → called from webhook-event.handler
 */
@Injectable()
export class WeezeventQueuedEntitySyncService {
    private readonly logger = new Logger(WeezeventQueuedEntitySyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Wallets & Users (webhook-triggered)
    // ─────────────────────────────────────────────────────────────

    async syncWallet(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        walletId: string,
    ): Promise<any> {
        this.logger.log(`Syncing wallet ${walletId} for tenant ${tenantId}`);

        const apiWallet = await this.weezeventClient.getWallet(tenantId, organizationId, walletId);
        const weezeventId = apiWallet.id.toString();
        const walletStatus = apiWallet.status as any;
        const walletStatusValue = typeof walletStatus === 'object' && walletStatus?.name
            ? walletStatus.name
            : (typeof walletStatus === 'string' ? walletStatus : 'unknown');

        return this.prisma.weezeventWallet.upsert({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
            create: {
                weezeventId, tenantId, integrationId,
                balance: apiWallet.balance,
                currency: 'EUR',
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

    async syncUser(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        userId: string,
    ): Promise<any> {
        this.logger.log(`Syncing user ${userId} for tenant ${tenantId}`);

        const apiUser = await this.weezeventClient.getUser(tenantId, organizationId, userId);
        const weezeventId = apiUser.id.toString();

        return this.prisma.weezeventUser.upsert({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
            create: {
                weezeventId, tenantId, integrationId,
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

    // ─────────────────────────────────────────────────────────────
    // Orders / Prices / Attendees (BullMQ queue jobs)
    // ─────────────────────────────────────────────────────────────

    async syncOrders(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'orders', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
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
                    tenantId, organizationId, eventId, { page, perPage: 100 },
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
                                weezeventId, tenantId, integrationId,
                                eventId, eventName: apiOrder.event_name || null,
                                userId: apiOrder.user_id?.toString() || null,
                                userEmail: apiOrder.user_email || null,
                                status: apiOrder.status || 'unknown',
                                totalAmount: apiOrder.total_amount || 0,
                                orderDate: apiOrder.order_date ? new Date(apiOrder.order_date) : new Date(),
                                paymentMethod: apiOrder.payment_method || null,
                                metadata: apiOrder.metadata || null,
                                rawData: apiOrder, syncedAt: new Date(),
                            },
                            update: {
                                status: apiOrder.status || 'unknown',
                                totalAmount: apiOrder.total_amount || 0,
                                rawData: apiOrder, syncedAt: new Date(),
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

    async syncPrices(tenantId: string, integrationId: string, eventId?: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'prices', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
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
                tenantId, organizationId, eventId, { perPage: 100 },
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
                            weezeventId, tenantId, integrationId,
                            eventId: eventId || apiPrice.event_id?.toString() || null,
                            productId: apiPrice.product_id?.toString() || null,
                            name: apiPrice.name || 'Unnamed Price',
                            amount: apiPrice.amount || 0,
                            currency: apiPrice.currency || 'EUR',
                            validFrom: apiPrice.valid_from ? new Date(apiPrice.valid_from) : null,
                            validUntil: apiPrice.valid_until ? new Date(apiPrice.valid_until) : null,
                            priceType: apiPrice.price_type || null,
                            metadata: apiPrice.metadata || null,
                            rawData: apiPrice, syncedAt: new Date(),
                        },
                        update: {
                            amount: apiPrice.amount || 0,
                            validFrom: apiPrice.valid_from ? new Date(apiPrice.valid_from) : null,
                            validUntil: apiPrice.valid_until ? new Date(apiPrice.valid_until) : null,
                            rawData: apiPrice, syncedAt: new Date(),
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

    async syncAttendees(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'attendees', success: false,
            itemsSynced: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 0,
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
                    tenantId, organizationId, eventId, { page, perPage: 100 },
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
                                weezeventId, tenantId, integrationId,
                                eventId, eventName: apiAttendee.event_name || null,
                                email: apiAttendee.email || null,
                                firstName: apiAttendee.first_name || null,
                                lastName: apiAttendee.last_name || null,
                                ticketType: apiAttendee.ticket_type || null,
                                status: apiAttendee.status || 'unknown',
                                metadata: apiAttendee.metadata || null,
                                rawData: apiAttendee, syncedAt: new Date(),
                            },
                            update: {
                                status: apiAttendee.status || 'unknown',
                                rawData: apiAttendee, syncedAt: new Date(),
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
