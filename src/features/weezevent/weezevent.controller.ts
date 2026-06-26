import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WeezeventSyncService, SyncResult } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService, IncrementalSyncResult } from './services/weezevent-incremental-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { StartSyncJobDto } from './dto/start-sync-job.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { MapProductToMenuItemDto } from './dto/map-product-to-menu-item.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SyncTrackerService } from './services/sync-tracker.service';
import { QueueService } from '../../core/queue/queue.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { WeezeventCollectWorkerService } from './services/weezevent-collect-worker.service';
import { WeezeventInsertWorkerService } from './services/weezevent-insert-worker.service';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';

@ApiTags('Weezevent')
@ApiBearerAuth('supabase-jwt')
@Controller('weezevent')
@UseGuards(JwtDatabaseGuard)
export class WeezeventController {
    private readonly logger = new Logger(WeezeventController.name);

    constructor(
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly prisma: PrismaService,
        private readonly syncTracker: SyncTrackerService,
        private readonly queueService: QueueService,
        private readonly weezeventClient: WeezeventClientService,
        private readonly collectWorker: WeezeventCollectWorkerService,
        private readonly insertWorker: WeezeventInsertWorkerService,
        private readonly pricing: MenuItemPricingService,
    ) { }

    /**
     * Get synced transactions from database
     */
    @Get('transactions')
    @ApiOperation({ summary: 'Lister les transactions Weezevent synchronisées' })
    @ApiResponse({ status: 200, description: 'Liste paginée des transactions Weezevent' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        const tenantId = user.tenantId;
        const { integrationId, page = 1, perPage = 50, status, fromDate, toDate, eventId, merchantId } = query;

        const where: any = { tenantId, integrationId };

        if (status) where.status = status;
        if (eventId) where.eventId = eventId;
        if (merchantId) where.merchantId = merchantId;
        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        const [transactions, total] = await Promise.all([
            this.prisma.weezeventTransaction.findMany({
                where,
                include: {
                    items: {
                        include: {
                            payments: true,
                        },
                    },
                },
                orderBy: { transactionDate: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventTransaction.count({ where }),
        ]);

        return {
            data: transactions,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Get a single transaction by ID
     */
    @Get('transactions/:id')
    @ApiOperation({ summary: 'Obtenir une transaction Weezevent par ID' })
    @ApiParam({ name: 'id', description: 'ID de la transaction' })
    @ApiResponse({ status: 200, description: 'Transaction Weezevent' })
    async getTransaction(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        const tenantId = user.tenantId;
        return this.prisma.weezeventTransaction.findFirst({
            where: { id, tenantId },
            include: {
                items: {
                    include: {
                        payments: true,
                    },
                },
                event: true,
                merchant: true,
                location: true,
            },
        });
    }

    /**
     * Fetch transactions DIRECTLY from the Weezevent API (no DB, no sync).
     * Useful for debugging / checking what the real Weezevent data looks like.
     */
    @Get('raw-transactions')
    @ApiOperation({ summary: 'Récupérer les transactions brutes depuis l\'API Weezevent (sans passer par la DB)' })
    @ApiResponse({ status: 200, description: 'Transactions brutes Weezevent' })
    async getRawTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        const tenantId = user.tenantId;
        const { integrationId, page = 1, perPage = 100, status, fromDate, toDate } = query;

        const integration = await this.prisma.weezeventIntegration.findUnique({
            where: { id: integrationId },
            select: { id: true, organizationId: true, enabled: true, tenantId: true },
        });

        if (!integration || integration.tenantId !== tenantId) {
            throw new BadRequestException(`Intégration Weezevent ${integrationId} introuvable.`);
        }
        if (!integration.organizationId) {
            throw new BadRequestException(`L\'organisation Weezevent n\'est pas configurée pour cette intégration.`);
        }

        return this.weezeventClient.getTransactions(tenantId, integration.organizationId, {
            page,
            perPage,
            status,
            fromDate: fromDate ? new Date(fromDate) : undefined,
            toDate: toDate ? new Date(toDate) : undefined,
        });
    }

    /**
     * Trigger manual synchronization — runs synchronously and returns the result directly.
     * transactions / events / products are executed in-process (no queue).
     * orders / prices / attendees are still queued via BullMQ.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync')
    @ApiOperation({ summary: 'Déclencher une synchronisation Weezevent' })
    @ApiBody({ type: SyncWeezeventDto })
    @ApiResponse({ status: 201, description: 'Synchronisation terminée' })
    async syncData(
        @CurrentUser() user: any,
        @Body() dto: SyncWeezeventDto,
    ) {
        const tenantId = user.tenantId;
        this.logger.log(
            `Manual sync started: type=${dto.type}, tenant=${tenantId}, forceFullSync=${dto.full || false}`,
        );

        const fromDate = dto.fromDate ? new Date(dto.fromDate) : undefined;
        const toDate = dto.toDate ? new Date(dto.toDate) : undefined;

        // Auto-recovery: if DB is empty for this type, force a full sync regardless of dto.full.
        // This fixes the case where data was purged but sync state still has lastSyncedAt set —
        // an incremental sync would skip everything and return 0.
        const autoFullForType = async (type: 'transactions' | 'events' | 'products'): Promise<boolean> => {
            const integrationId = dto.integrationId;
            const counter =
                type === 'transactions' ? this.prisma.weezeventTransaction.count({ where: { tenantId, integrationId } }) :
                type === 'events' ? this.prisma.weezeventEvent.count({ where: { tenantId, integrationId } }) :
                this.prisma.weezeventProduct.count({ where: { tenantId, integrationId } });
            const n = await counter;
            if (n === 0 && !dto.full) {
                this.logger.warn(`Auto full-sync: ${type} DB is empty for tenant ${tenantId}, resetting sync state`);
                await this.incrementalSyncService.resetSyncState(tenantId, integrationId, type).catch(() => undefined);
                return true;
            }
            return Boolean(dto.full);
        };

        switch (dto.type) {
            case 'transactions': {
                const t0 = Date.now();
                const forceFull = await autoFullForType('transactions');
                const result = await this.incrementalSyncService.syncTransactionsIncremental(tenantId, dto.integrationId, {
                    forceFullSync: forceFull,
                    updatedSince: fromDate,
                    updatedUntil: toDate,
                });
                const [count, eventCount, productCount, locationCount] = await Promise.all([
                    this.prisma.weezeventTransaction.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.weezeventEvent.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.weezeventProduct.count({ where: { tenantId, integrationId: dto.integrationId } }),
                    this.prisma.weezeventLocation.count({ where: { tenantId, integrationId: dto.integrationId } }),
                ]);
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: transactions done in ${duration}ms — ${result.itemsSynced} synced, total=${count} (events=${eventCount}, products=${productCount}, locations=${locationCount}, hasMore=${result.hasMore})`);
                return { status: 'completed', syncType: 'transactions', count, eventCount, productCount, locationCount, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, hasMore: result.hasMore, duration };
            }

            case 'events': {
                const t0 = Date.now();
                const forceFull = await autoFullForType('events');
                const result = await this.incrementalSyncService.syncEventsIncremental(tenantId, dto.integrationId, {
                    forceFullSync: forceFull,
                });
                const count = await this.prisma.weezeventEvent.count({ where: { tenantId, integrationId: dto.integrationId } });
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: events done in ${duration}ms — ${result.itemsSynced} synced, total=${count}`);
                return { status: 'completed', syncType: 'events', count, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, duration };
            }

            case 'products': {
                const t0 = Date.now();
                await autoFullForType('products');
                const result = await this.syncService.syncProducts(tenantId, dto.integrationId);
                const count = await this.prisma.weezeventProduct.count({ where: { tenantId, integrationId: dto.integrationId } });
                const duration = Date.now() - t0;
                this.logger.log(`Manual sync: products done in ${duration}ms — ${result.itemsSynced} synced, total=${count}`);
                return { status: 'completed', syncType: 'products', count, itemsSynced: result.itemsSynced, itemsCreated: result.itemsCreated, duration };
            }

            case 'orders': {
                if (!dto.eventId) throw new Error('eventId is required for orders sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'orders', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'orders' };
            }

            case 'prices': {
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'prices', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'prices' };
            }

            case 'attendees': {
                if (!dto.eventId) throw new Error('eventId is required for attendees sync');
                const job = await this.queueService.queueWeezeventSyncType(
                    tenantId, 'attendees', { eventId: dto.eventId },
                );
                return { jobId: job.id, status: 'queued', syncType: 'attendees' };
            }

            default:
                throw new Error(`Sync type '${dto.type}' not implemented`);
        }
    }

    /**
     * Get sync status (including incremental state + BullMQ queue stats)
     */
    @Get('sync/status')
    @ApiOperation({ summary: 'Obtenir le statut de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Filtrer par intégration — si omis, retourne les totaux toutes intégrations confondues' })
    @ApiResponse({ status: 200, description: 'Statut des synchronisations Weezevent' })
    async getSyncStatus(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
        const tenantId = user.tenantId;

        const [incrementalStatus, transactionCount, eventCount, productCount, queueStats, jobsProgress] =
            await Promise.all([
                this.incrementalSyncService.getSyncStatus(tenantId, integrationId),
                this.prisma.weezeventTransaction.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.prisma.weezeventEvent.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.prisma.weezeventProduct.count({ where: { tenantId, ...(integrationId ? { integrationId } : {}) } }),
                this.queueService.getQueueStats('data-sync').catch(() => null),
                this.queueService.getActiveJobsProgress('data-sync').catch(() => ({})),
            ]);

        return {
            events: { ...incrementalStatus.events, count: eventCount },
            transactions: { ...incrementalStatus.transactions, count: transactionCount },
            products: { ...incrementalStatus.products, count: productCount },
            // BullMQ queue stats (persistent, survives restarts)
            queue: queueStats,
            // Per-job progress for active jobs: { transactions: 45, events: 10, ... }
            jobsProgress,
        };
    }

    /**
     * Reset sync state (force full sync next time)
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/state')
    @ApiOperation({ summary: 'Réinitialiser l’état de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration à réinitialiser — si omis, réinitialise toutes les intégrations du tenant' })
    @ApiQuery({ name: 'type', required: false, type: String, description: 'Type de sync à réinitialiser : transactions | events | products' })
    @ApiResponse({ status: 200, description: 'État de synchronisation réinitialisé' })
    async resetSyncState(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
        @Query('type') syncType?: string,
    ) {
        const tenantId = user.tenantId;
        this.logger.log(`Resetting sync state for tenant ${tenantId}${integrationId ? ` (integration: ${integrationId})` : ''}${syncType ? ` (type: ${syncType})` : ''}`);
        
        await this.incrementalSyncService.resetSyncState(tenantId, integrationId, syncType);
        
        return { 
            success: true, 
            message: syncType 
                ? `Sync state reset for ${syncType}` 
                : 'All sync states reset',
        };
    }

    /**
     * Purge all synced Weezevent data for this tenant.
     * Called when removing an integration with the "delete data" option.
     * Deletes in dependency order to respect foreign key constraints.
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('data')
    @ApiOperation({ summary: 'Supprimer toutes les données Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Supprimer uniquement les données de cette intégration — si omis, supprime TOUT le tenant' })
    @ApiResponse({ status: 200, description: 'Données supprimées' })
    async purgeData(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
        const tenantId = user.tenantId;
        const label = integrationId ? `integration ${integrationId}` : `tenant ${tenantId}`;
        this.logger.warn(`Purging all Weezevent data for ${label}`);

        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;

        // WeezeventProductMapping has no integrationId column — filter via relation
        const mappingWhere: any = integrationId
            ? { tenantId, weezeventProduct: { integrationId } }
            : { tenantId };

        // WeezeventTransactionItem has no integrationId column — filter via transaction relation
        const itemWhere: any = integrationId
            ? { transaction: { tenantId, integrationId } }
            : { transaction: { tenantId } };

        // Delete in dependency order (children first)
        const [
            attendees, prices, orders,
            components, variants,
            items, transactions,
            mappings, products,
            merchants, locations, wallets, users, events,
            syncStates,
        ] = await this.prisma.$transaction([
            this.prisma.weezeventAttendee.deleteMany({ where }),
            this.prisma.weezeventPrice.deleteMany({ where }),
            this.prisma.weezeventOrder.deleteMany({ where }),
            this.prisma.weezeventProductComponent.deleteMany({ where }),
            this.prisma.weezeventProductVariant.deleteMany({ where }),
            this.prisma.weezeventTransactionItem.deleteMany({ where: itemWhere }),
            this.prisma.weezeventTransaction.deleteMany({ where }),
            this.prisma.weezeventProductMapping.deleteMany({ where: mappingWhere }),
            this.prisma.weezeventProduct.deleteMany({ where }),
            this.prisma.weezeventMerchant.deleteMany({ where }),
            this.prisma.weezeventLocation.deleteMany({ where }),
            this.prisma.weezeventWallet.deleteMany({ where }),
            this.prisma.weezeventUser.deleteMany({ where }),
            this.prisma.weezeventEvent.deleteMany({ where }),
            this.prisma.weezeventSyncState.deleteMany({ where }),
        ]);

        const total =
            attendees.count + prices.count + orders.count +
            components.count + variants.count +
            items.count + transactions.count +
            mappings.count + products.count +
            merchants.count + locations.count + wallets.count + users.count + events.count +
            syncStates.count;

        this.logger.warn(`Purge complete for tenant ${tenantId}: ${total} records deleted`);

        return {
            success: true,
            deleted: {
                events: events.count,
                transactions: transactions.count,
                products: products.count,
                variants: variants.count,
                components: components.count,
                orders: orders.count,
                items: items.count,
                merchants: merchants.count,
                locations: locations.count,
                wallets: wallets.count,
                users: users.count,
                attendees: attendees.count,
                prices: prices.count,
                mappings: mappings.count,
                syncStates: syncStates.count,
                total,
            },
        };
    }

    /**
     * Get events
     */
    @Get('events')
    @ApiOperation({ summary: 'Lister les événements Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page', example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, description: 'Résultats par page (max 500)', example: 50 })
    @ApiQuery({ name: 'status', required: false, description: 'Statut de l\'événement' })
    @ApiQuery({ name: 'search', required: false, description: 'Recherche dans le nom' })
    @ApiQuery({ name: 'startDateFrom', required: false, description: 'Date de début min (ISO 8601)' })
    @ApiQuery({ name: 'startDateTo', required: false, description: 'Date de début max (ISO 8601)' })
    @ApiResponse({ status: 200, description: 'Liste paginée des événements Weezevent' })
    async getEvents(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 50,
        @Query('integrationId') integrationId?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('startDateFrom') startDateFrom?: string,
        @Query('startDateTo') startDateTo?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 50, 500);

        // Filters: status (exact, or "all" to skip), name search, date range on startDate
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search && search.trim()) {
            where.name = { contains: search.trim(), mode: 'insensitive' };
        }
        if (startDateFrom || startDateTo) {
            where.startDate = {};
            if (startDateFrom) {
                const d = new Date(startDateFrom);
                if (!isNaN(d.getTime())) where.startDate.gte = d;
            }
            if (startDateTo) {
                const d = new Date(startDateTo);
                if (!isNaN(d.getTime())) where.startDate.lte = d;
            }
            if (Object.keys(where.startDate).length === 0) delete where.startDate;
        }

        const [events, total] = await Promise.all([
            this.prisma.weezeventEvent.findMany({
                where,
                orderBy: { startDate: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventEvent.count({ where }),
        ]);

        return {
            data: events,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get locations
     */
    @Get('locations')
    @ApiOperation({ summary: 'Lister les locations Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'type', required: false, description: 'Type de location : sale | all — défaut : sale' })
    @ApiResponse({ status: 200, description: 'Liste des locations Weezevent' })
    async getLocations(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('integrationId') integrationId?: string,
        @Query('type') type?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (type === 'all') {
            // no type filter
        } else if (type) {
            where.type = type;
        } else {
            where.type = 'sale'; // default: only physical sales locations
        }

        const [locations, total] = await Promise.all([
            this.prisma.weezeventLocation.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventLocation.count({ where }),
        ]);

        return {
            data: locations,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get merchants
     */
    @Get('merchants')
    @ApiOperation({ summary: 'Lister les merchants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'locationId', required: false, description: 'Filtrer les merchants ayant des transactions à cette location' })
    @ApiResponse({ status: 200, description: 'Liste des merchants Weezevent' })
    async getMerchants(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('integrationId') integrationId?: string,
        @Query('locationId') locationId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        // If locationId provided, find merchants via transactions at that location
        if (locationId) {
            const txWhere: any = { tenantId, locationId, merchantId: { not: null } };
            if (integrationId) txWhere.integrationId = integrationId;
            const merchantIds = await this.prisma.weezeventTransaction.findMany({
                where: txWhere,
                select: { merchantId: true },
                distinct: ['merchantId'],
            });
            const ids = merchantIds.map(m => m.merchantId).filter(Boolean);

            if (ids.length > 0) {
                const mWhere: any = { tenantId, id: { in: ids } };
                if (integrationId) mWhere.integrationId = integrationId;
                const merchants = await this.prisma.weezeventMerchant.findMany({
                    where: mWhere,
                    orderBy: { name: 'asc' },
                });
                return { data: merchants, meta: { total: merchants.length } };
            }
            // Fallback: no transactions at this location yet — return all tenant merchants
        }

        const mWhere2: any = { tenantId };
        if (integrationId) mWhere2.integrationId = integrationId;
        const [merchants, total] = await Promise.all([
            this.prisma.weezeventMerchant.findMany({
                where: mWhere2,
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventMerchant.count({ where: mWhere2 }),
        ]);

        return {
            data: merchants,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get products
     */
    @Get('products')
    @ApiOperation({ summary: 'Lister les produits Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'category', required: false, description: 'Filtrer par catégorie de produit' })
    @ApiResponse({ status: 200, description: 'Liste paginée des produits Weezevent' })
    async getProducts(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('category') category?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (category) where.category = category;

        const [products, total] = await Promise.all([
            this.prisma.weezeventProduct.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventProduct.count({ where }),
        ]);

        return {
            data: products,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Refresh one product details.
     * Local-first: use local WeezeventProduct/rawData when possible, then try Weezevent API only
     * for missing fields. If the external API fails, return the local record instead of breaking UI.
     */
    @Get('products/:productId/refresh')
    @ApiOperation({ summary: 'Rafraîchir les détails d’un produit Weezevent local-first' })
    @ApiParam({ name: 'productId', description: 'ID interne du produit Weezevent' })
    @ApiResponse({ status: 200, description: 'Produit enrichi depuis la DB locale ou Weezevent' })
    async refreshProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        const tenantId = user.tenantId;
        const product = await this.prisma.weezeventProduct.findFirst({
            where: { id: productId, tenantId },
            include: { integration: true },
        });

        if (!product) {
            throw new NotFoundException(`Product ${productId} not found`);
        }

        const rawData = (product.rawData || {}) as any;
        const localData = {
            nature: product.nature ?? rawData.nature ?? null,
            subnature: product.subnature ?? rawData.subnature ?? null,
            productType: product.productType ?? rawData.type ?? null,
            basePrice: product.basePrice != null
                ? Number(product.basePrice)
                : rawData.base_price != null
                    ? Number(rawData.base_price)
                    : rawData.basePrice != null
                        ? Number(rawData.basePrice)
                        : null,
            rawData,
        };

        const hasUsefulLocalData =
            localData.basePrice != null &&
            (!!localData.nature || !!localData.subnature || !!localData.productType);

        if (hasUsefulLocalData) {
            return { ...product, ...localData, source: 'local' };
        }

        if (!product.integration?.organizationId) {
            return { ...product, ...localData, source: 'local', warning: 'Missing Weezevent organizationId' };
        }

        try {
            const apiProduct = await this.weezeventClient.getProduct(
                tenantId,
                product.integration.organizationId,
                product.weezeventId,
            );

            const rawCategoryId = (apiProduct as any).category_id;
            const updateData = {
                name: apiProduct.name || product.name,
                description: apiProduct.description ?? product.description,
                nature: (apiProduct as any).nature ?? product.nature,
                subnature: (apiProduct as any).subnature ?? product.subnature,
                productType: (apiProduct as any).type ?? product.productType,
                categoryId: rawCategoryId != null
                    ? String(rawCategoryId)
                    : (apiProduct as any).category != null
                        ? String((apiProduct as any).category)
                        : product.categoryId,
                basePrice: (apiProduct as any).base_price != null
                    ? (apiProduct as any).base_price
                    : product.basePrice,
                vatRate: (apiProduct as any).vat_rate != null
                    ? (apiProduct as any).vat_rate
                    : product.vatRate,
                image: (apiProduct as any).image ?? product.image,
                rawData: apiProduct as any,
                syncedAt: new Date(),
            };

            const refreshed = await this.prisma.weezeventProduct.update({
                where: { id: product.id },
                data: updateData,
            });

            return { ...refreshed, basePrice: refreshed.basePrice != null ? Number(refreshed.basePrice) : null, source: 'weezevent' };
        } catch (error) {
            this.logger.warn(`Weezevent product refresh failed for ${productId}: ${error.message}`);
            return { ...product, ...localData, source: 'local', warning: 'Weezevent refresh failed' };
        }
    }

    /**
     * Map a Weezevent product to a MenuItem
     */
    @RequirePermissions('menu.integration.fb')
    @Post('products/:productId/map')
    @ApiOperation({ summary: 'Associer un produit Weezevent à un menu item' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiBody({ type: MapProductToMenuItemDto })
    @ApiResponse({ status: 201, description: 'Mapping créé ou mis à jour' })
    async mapProductToMenuItem(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() body: MapProductToMenuItemDto,
    ) {
        const tenantId = user.tenantId;

        // Verify product exists
        const product = await this.prisma.weezeventProduct.findFirst({
            where: { id: productId, tenantId },
        });

        if (!product) {
            throw new Error('Product not found');
        }

        // Verify menu item exists
        const menuItem = await this.prisma.menuItem.findFirst({
            where: { id: body.menuItemId, tenantId },
        });

        if (!menuItem) {
            throw new Error('Menu item not found');
        }

        // Create or update mapping
        const mapping = await this.prisma.weezeventProductMapping.upsert({
            where: { weezeventProductId: productId },
            create: {
                tenantId,
                weezeventProductId: productId,
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
            update: {
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
        });

        return {
            success: true,
            mapping,
        };
    }

    /**
     * Get product mappings
     */
    @Get('products/mappings')
    @ApiOperation({ summary: 'Lister les mappings produits Weezevent / menu items' })
    @ApiResponse({ status: 200, description: 'Liste paginée des mappings de produits' })
    async getProductMappings(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);

        const [mappings, total] = await Promise.all([
            this.prisma.weezeventProductMapping.findMany({
                where: { tenantId },
                include: {
                    weezeventProduct: { include: { prices: true } },
                    menuItem: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
        ]);

        // Étape 3 Data Integration : on expose TOUT (le front décide quoi afficher) —
        // menuItem.pricing (catalogue) + weezeventProduct.pricing (référence Weezevent,
        // TVA + devise réelles) + weezeventProduct.salesPricing (réellement encaissé).
        const data = await this.pricing.enrichMappingsPricing(mappings, tenantId);

        return {
            data,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Delete a product mapping
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('products/:productId/map')
    @ApiOperation({ summary: 'Supprimer le mapping d’un produit Weezevent' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiResponse({ status: 200, description: 'Mapping supprimé' })
    async unmapProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        const tenantId = user.tenantId;

        await this.prisma.weezeventProductMapping.deleteMany({
            where: {
                weezeventProductId: productId,
                tenantId,
            },
        });

        return { success: true };
    }

    /**
     * Get orders
     */
    @Get('orders')
    @ApiOperation({ summary: 'Lister les commandes Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des commandes Weezevent' })
    async getOrders(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [orders, total] = await Promise.all([
            this.prisma.weezeventOrder.findMany({
                where,
                orderBy: { orderDate: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventOrder.count({ where }),
        ]);

        return {
            data: orders,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get prices
     */
    @Get('prices')
    @ApiOperation({ summary: 'Lister les tarifs Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des tarifs Weezevent' })
    async getPrices(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [prices, total] = await Promise.all([
            this.prisma.weezeventPrice.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventPrice.count({ where }),
        ]);

        return {
            data: prices,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Get attendees
     */
    @Get('attendees')
    @ApiOperation({ summary: 'Lister les participants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des participants Weezevent' })
    async getAttendees(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('integrationId') integrationId?: string,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (eventId) where.eventId = eventId;

        const [attendees, total] = await Promise.all([
            this.prisma.weezeventAttendee.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventAttendee.count({ where }),
        ]);

        return {
            data: attendees,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    // ==================== SYNC JOBS (nouvelle architecture bisection) ====================

    /**
     * Démarre un job de sync asynchrone avec bissection.
     * Retourne immédiatement un jobId — le frontend poll GET /sync/status/:jobId.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync/start')
    @ApiOperation({ summary: 'Démarrer un job de synchronisation par bissection' })
    @ApiBody({ type: StartSyncJobDto })
    @ApiResponse({ status: 201, description: 'Job créé, retourne jobId' })
    async startSyncJob(
        @CurrentUser() user: any,
        @Body() dto: StartSyncJobDto,
    ) {
        const tenantId = user.tenantId;

        const integration = await this.prisma.weezeventIntegration.findFirst({
            where: { id: dto.integrationId, tenantId, enabled: true },
            select: { id: true, organizationId: true },
        });

        if (!integration) {
            throw new BadRequestException(`Intégration Weezevent ${dto.integrationId} introuvable ou désactivée.`);
        }
        if (!integration.organizationId) {
            throw new BadRequestException(`L'organisation Weezevent n'est pas configurée pour cette intégration.`);
        }

        // Refuser si un job est déjà en cours pour cette intégration
        const running = await this.prisma.weezeventSyncJob.findFirst({
            where: { integrationId: dto.integrationId, status: 'COLLECTING' },
            select: { id: true },
        });
        if (running) {
            throw new BadRequestException(`Un job de sync est déjà en cours (jobId: ${running.id}).`);
        }

        const job = await this.prisma.weezeventSyncJob.create({
            data: {
                tenantId,
                integrationId: dto.integrationId,
                fromDate: new Date(dto.fromDate),
                toDate: new Date(dto.toDate),
                status: 'PENDING',
            },
        });

        // Lancer collect + insert en background (sans await)
        this.collectWorker.start(job.id).catch(err =>
            this.logger.error(`[startSyncJob] CollectWorker crash for job ${job.id}: ${err.message}`),
        );
        this.insertWorker.watch(job.id).catch(err =>
            this.logger.error(`[startSyncJob] InsertWorker crash for job ${job.id}: ${err.message}`),
        );

        this.logger.log(`Job de sync démarré: jobId=${job.id} intégration=${dto.integrationId} ${dto.fromDate} → ${dto.toDate}`);

        return { jobId: job.id, status: 'PENDING' };
    }

    /**
     * Retourne l'état en temps réel d'un job de sync.
     * Le frontend poll cet endpoint toutes les 3s.
     */
    @Get('sync/status/:jobId')
    @ApiOperation({ summary: 'État d\'un job de synchronisation' })
    @ApiParam({ name: 'jobId', description: 'ID du job retourné par POST /sync/start' })
    @ApiResponse({ status: 200, description: 'État du job' })
    async getSyncJobStatus(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;
        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                totalChunks: true,
                processedChunks: true,
                collectDone: true,
                errorMessage: true,
                startedAt: true,
                completedAt: true,
            },
        });

        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const collectProgress = job.totalChunks > 0
            ? Math.round((job.processedChunks / job.totalChunks) * 100)
            : 0;
        const insertProgress = job.totalCollected > 0
            ? Math.round((job.totalInserted / job.totalCollected) * 100)
            : 0;

        return {
            jobId: job.id,
            status: job.status,
            fromDate: job.fromDate,
            toDate: job.toDate,
            totalCollected: job.totalCollected,
            totalInserted: job.totalInserted,
            totalChunks: job.totalChunks,
            processedChunks: job.processedChunks,
            collectDone: job.collectDone,
            collectProgress,
            insertProgress,
            errorMessage: job.errorMessage,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
    }

    /**
     * Liste les jobs de sync pour une intégration donnée.
     */
    @Get('sync/jobs')
    @ApiOperation({ summary: 'Lister les jobs de sync pour une intégration' })
    @ApiQuery({ name: 'integrationId', required: true, description: 'ID de l\'intégration' })
    @ApiResponse({ status: 200, description: 'Liste des jobs' })
    async listSyncJobs(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId: string,
    ) {
        const tenantId = user.tenantId;
        const jobs = await this.prisma.weezeventSyncJob.findMany({
            where: { tenantId, integrationId },
            orderBy: { startedAt: 'desc' },
            take: 20,
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                startedAt: true,
                completedAt: true,
            },
        });
        return { data: jobs };
    }

    /**
     * Retourne des statistiques sur les transactions couvertes par un job de sync.
     * Calcule le nombre distinct d'événements, locations et produits dans la plage de dates du job.
     */
    @Get('sync/jobs/:jobId/stats')
    @ApiOperation({ summary: 'Statistiques d\'un job de sync (transactions, events, locations, produits)' })
    @ApiParam({ name: 'jobId', description: 'ID du job' })
    @ApiResponse({ status: 200, description: 'Statistiques du job' })
    async getSyncJobStats(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, integrationId: true, fromDate: true, toDate: true, totalCollected: true, totalInserted: true },
        });
        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const where = {
            tenantId,
            integrationId: job.integrationId,
            transactionDate: { gte: job.fromDate, lte: job.toDate },
        };

        const [transactionCount, eventGroups, locationGroups, productGroups] = await Promise.all([
            this.prisma.weezeventTransaction.count({ where }),
            this.prisma.weezeventTransaction.groupBy({
                by: ['eventId'],
                where: { ...where, eventId: { not: null } },
            }),
            this.prisma.weezeventTransaction.groupBy({
                by: ['locationId'],
                where: { ...where, locationId: { not: null } },
            }),
            this.prisma.weezeventTransactionItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { not: null },
                    transaction: where,
                },
            }),
        ]);

        return {
            jobId,
            transactions: transactionCount,
            events: eventGroups.length,
            locations: locationGroups.length,
            products: productGroups.length,
        };
    }

    /**
     * Supprime un job de sync (et ses chunks via cascade).
     * Interdit si le job est encore actif (COLLECTING ou INSERTING).
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/jobs/:jobId')
    @ApiOperation({ summary: 'Supprimer un job de sync' })
    @ApiParam({ name: 'jobId', description: 'ID du job à supprimer' })
    @ApiResponse({ status: 200, description: 'Job supprimé' })
    async deleteSyncJob(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, status: true, startedAt: true },
        });

        if (!job) {
            throw new NotFoundException(`Job de sync ${jobId} introuvable.`);
        }

        // Bloquer uniquement si le job a démarré il y a moins de 2 minutes
        // (jobs bloqués par un ancien bug ou un redémarrage serveur peuvent être supprimés)
        if (job.status === 'COLLECTING' || job.status === 'INSERTING') {
            const ageMs = Date.now() - new Date(job.startedAt).getTime();
            if (ageMs < 2 * 60 * 1000) {
                throw new BadRequestException(`Impossible de supprimer un job démarré il y a moins de 2 minutes (status: ${job.status}).`);
            }
            this.logger.warn(`[deleteSyncJob] Suppression forcée d'un job bloqué: ${jobId} status=${job.status}`);
        }

        await this.prisma.weezeventSyncJob.delete({ where: { id: jobId } });

        return { deleted: true, jobId };
    }
}
