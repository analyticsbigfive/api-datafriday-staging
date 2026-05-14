import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WeezeventSyncService, SyncResult } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService, IncrementalSyncResult } from './services/weezevent-incremental-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { MapProductToMenuItemDto } from './dto/map-product-to-menu-item.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SyncTrackerService } from './services/sync-tracker.service';
import { QueueService } from '../../core/queue/queue.service';

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
     * Trigger manual synchronization — runs synchronously and returns the result directly.
     * transactions / events / products are executed in-process (no queue).
     * orders / prices / attendees are still queued via BullMQ.
     */
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
     * Map a Weezevent product to a MenuItem
     */
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
                    weezeventProduct: true,
                    menuItem: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
        ]);

        return {
            data: mappings,
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
}
