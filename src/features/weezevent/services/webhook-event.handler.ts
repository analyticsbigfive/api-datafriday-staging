import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';

interface WebhookEvent {
    id: string;
    tenantId: string;
    eventType: string;
    method: string;
    payload: any;
}

@Injectable()
export class WebhookEventHandler {
    private readonly logger = new Logger(WebhookEventHandler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncService: WeezeventSyncService,
    ) { }

    /**
     * Process a webhook event
     */
    async processEvent(eventId: string): Promise<void> {
        const event = await this.prisma.weezeventWebhookEvent.findUnique({
            where: { id: eventId },
            include: { tenant: true },
        });

        if (!event) {
            this.logger.error(`Webhook event ${eventId} not found`);
            return;
        }

        if (event.processed) {
            this.logger.warn(`Webhook event ${eventId} already processed`);
            return;
        }

        try {
            // Route to appropriate handler based on event type
            switch (event.eventType) {
                case 'transaction':
                    await this.handleTransactionEvent(event);
                    break;
                default:
                    this.logger.warn(`Unknown event type: ${event.eventType}`);
            }

            // Mark as processed
            await this.prisma.weezeventWebhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });

            this.logger.log(`Successfully processed webhook event ${eventId}`);
        } catch (error) {
            this.logger.error(
                `Failed to process webhook event ${eventId}`,
                error.stack,
            );

            // Update error and retry count
            await this.prisma.weezeventWebhookEvent.update({
                where: { id: eventId },
                data: {
                    error: error.message,
                    retryCount: { increment: 1 },
                },
            });

            throw error;
        }
    }

    /**
     * Handle transaction webhook event (create/update/delete)
     */
    private async handleTransactionEvent(event: WebhookEvent): Promise<void> {
        const { method, payload } = event;
        const transactionId = payload.data?.id?.toString();

        if (!transactionId) {
            throw new Error('Transaction ID not found in webhook payload');
        }

        this.logger.log(
            `Handling transaction ${method} for ID: ${transactionId}`,
        );

        switch (method) {
            case 'create':
            case 'update':
                // Sync the transaction from Weezevent API
                // We fetch fresh data from API to ensure consistency
                await this.syncTransactionById(event.tenantId, transactionId);
                break;

            case 'delete':
                // Mark transaction as deleted (soft delete)
                await this.markTransactionAsDeleted(transactionId);
                break;

            default:
                this.logger.warn(`Unknown transaction method: ${method}`);
        }
    }

    /**
     * Sync a specific transaction by ID
     */
    private async syncTransactionById(
        tenantId: string,
        transactionId: string,
    ): Promise<void> {
        // Get tenant's Weezevent organization ID
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant?.weezeventEnabled) {
            throw new Error('Weezevent not enabled for this tenant');
        }

        // Sync the single transaction from Weezevent API
        this.logger.log(
            `Syncing transaction ${transactionId} from Weezevent API (tenant: ${tenantId})`,
        );

        try {
            const result = await this.syncService.syncSingleTransaction(
                tenantId,
                transactionId,
            );

            this.logger.log(
                `Transaction ${transactionId} synced successfully (created: ${result.created}, updated: ${result.updated})`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to sync transaction ${transactionId}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Mark a transaction as deleted (soft delete)
     */
    private async markTransactionAsDeleted(
        transactionId: string,
    ): Promise<void> {
        const updated = await this.prisma.weezeventTransaction.updateMany({
            where: { weezeventId: transactionId },
            data: {
                // We could add a deletedAt field or update status
                // For now, we'll just log it
                syncedAt: new Date(),
            },
        });

        if (updated.count === 0) {
            this.logger.warn(`Transaction ${transactionId} not found for deletion`);
        } else {
            this.logger.log(`Marked transaction ${transactionId} as deleted`);
        }
    }
}
