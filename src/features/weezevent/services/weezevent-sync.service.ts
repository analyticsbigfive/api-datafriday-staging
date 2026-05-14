import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';
import { WeezeventTransactionSyncService } from './sync/transaction-sync.service';
import { WeezeventCatalogSyncService } from './sync/catalog-sync.service';
import { WeezeventQueuedEntitySyncService } from './sync/queued-entity-sync.service';

// Re-export types so existing callers (spec files, queue processor, etc.) don't need to change imports.
export interface SyncResult {
    type: string;
    success: boolean;
    itemsSynced: number;
    itemsCreated: number;
    itemsUpdated: number;
    errors: number;
    duration: number;
    fromDate?: Date;
    toDate?: Date;
}

export interface SyncTransactionsOptions {
    fromDate?: Date;
    toDate?: Date;
    full?: boolean;
    eventId?: number;
}

/**
 * WeezeventSyncService — thin façade
 *
 * Delegates to focused sub-services (SOLID / SRP):
 *   - WeezeventTransactionSyncService  → transaction pipeline
 *   - WeezeventCatalogSyncService      → event & product catalog enrichment (CRON)
 *   - WeezeventQueuedEntitySyncService → BullMQ jobs + webhook entity sync
 *
 * Keeping this class preserves backward-compatibility for all existing callers
 * (data-sync.processor, webhook-event.handler, weezevent.controller, cron).
 * Inject the focused sub-services directly in new code.
 */
@Injectable()
export class WeezeventSyncService {
    private readonly logger = new Logger(WeezeventSyncService.name);

    constructor(
        // Sub-services injected so NestJS wires them up; kept private since
        // this class is purely a delegation layer.
        private readonly transactionSync: WeezeventTransactionSyncService,
        private readonly catalogSync: WeezeventCatalogSyncService,
        private readonly queuedEntitySync: WeezeventQueuedEntitySyncService,
        // Legacy deps — kept so the module does not need a provider change for
        // consumers that still inject WeezeventSyncService directly.
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    // ─── Transactions ──────────────────────────────────────────────────────────

    syncTransactions(
        tenantId: string,
        integrationId: string,
        options?: SyncTransactionsOptions,
    ): Promise<SyncResult> {
        return this.transactionSync.syncTransactions(tenantId, integrationId, options);
    }

    syncSingleTransaction(
        tenantId: string,
        integrationId: string,
        transactionId: string | number,
    ): Promise<{ created: boolean; updated: boolean }> {
        return this.transactionSync.syncSingleTransaction(tenantId, integrationId, transactionId);
    }

    // ─── Catalog enrichment ────────────────────────────────────────────────────

    syncEvents(tenantId: string, integrationId: string): Promise<SyncResult> {
        return this.catalogSync.syncEvents(tenantId, integrationId);
    }

    syncProducts(tenantId: string, integrationId: string): Promise<SyncResult> {
        return this.catalogSync.syncProducts(tenantId, integrationId);
    }

    // ─── Queued / webhook entities ─────────────────────────────────────────────

    syncWallet(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        walletId: string,
    ): Promise<any> {
        return this.queuedEntitySync.syncWallet(tenantId, integrationId, organizationId, walletId);
    }

    syncUser(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        userId: string,
    ): Promise<any> {
        return this.queuedEntitySync.syncUser(tenantId, integrationId, organizationId, userId);
    }

    syncOrders(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncOrders(tenantId, integrationId, eventId);
    }

    syncPrices(tenantId: string, integrationId: string, eventId?: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncPrices(tenantId, integrationId, eventId);
    }

    syncAttendees(tenantId: string, integrationId: string, eventId: string): Promise<SyncResult> {
        return this.queuedEntitySync.syncAttendees(tenantId, integrationId, eventId);
    }
}
