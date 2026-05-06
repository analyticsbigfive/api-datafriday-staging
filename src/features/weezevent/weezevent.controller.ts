import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, Logger } from '@nestjs/common';
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
        const { page = 1, perPage = 50, status, fromDate, toDate, eventId, merchantId } = query;

        const where: any = { tenantId };

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
     * Trigger manual synchronization (supports incremental)
     */
    @Post('sync')
    @ApiOperation({ summary: 'Déclencher une synchronisation Weezevent' })
    @ApiBody({ type: SyncWeezeventDto })
    @ApiResponse({ status: 201, description: 'Synchronisation déclenchée' })
    async syncData(
        @CurrentUser() user: any,
        @Body() dto: SyncWeezeventDto,
    ) {
        const tenantId = user.tenantId;
        this.logger.log(
            `Manual sync triggered: type=${dto.type}, tenant=${tenantId}, forceFullSync=${dto.full || false}`,
        );

        const fromDate = dto.fromDate ? new Date(dto.fromDate) : undefined;

        // Helper: returns true if error is a Redis quota / connection error
        const isRedisUnavailable = (e: Error) => {
            const m = e.message || '';
            return m.includes('max requests limit exceeded') ||
                m.includes('ECONNREFUSED') ||
                m.includes('ENOTFOUND') ||
                m.includes('Connection is closed') ||
                m.includes('connect ETIMEDOUT');
        };

        // Helper: run sync directly in-process (fire-and-forget background task).
        // Used as fallback when the Redis queue is unavailable.
        const runDirectSync = (fn: () => Promise<any>, syncType: string) => {
            const id = `direct-${tenantId}-${syncType}-${Date.now()}`;
            fn().then(() => {
                this.logger.log(`Direct sync ${id} completed`);
            }).catch((e) => {
                this.logger.error(`Direct sync ${id} failed: ${e.message}`);
            });
            return {
                jobId: id,
                status: 'running_direct',
                syncType,
                message: `Redis queue unavailable — sync running in-process. ` +
                    `Set REDIS_QUEUE_URL to a dedicated Redis to restore persistent queuing.`,
            };
        };

        try {
            switch (dto.type) {
                case 'transactions':
                case 'events':
                case 'products': {
                    // Enqueue via BullMQ: persistent, retried automatically (3×), deduped by jobId
                    const job = await this.queueService.queueWeezeventSyncType(
                        tenantId,
                        dto.type,
                        {
                            fullSync: dto.full,
                            startDate: fromDate?.toISOString(),
                            endDate: dto.toDate,
                        },
                    );
                    return {
                        jobId: job.id,
                        status: 'queued',
                        syncType: dto.type,
                        message: `${dto.type} sync queued — poll GET /weezevent/sync/status for progress`,
                    };
                }

                case 'orders': {
                    if (!dto.eventId) throw new Error('eventId is required for orders sync');
                    const job = await this.queueService.queueWeezeventSyncType(
                        tenantId,
                        'orders',
                        { eventId: dto.eventId },
                    );
                    return { jobId: job.id, status: 'queued', syncType: 'orders' };
                }

                case 'prices': {
                    const job = await this.queueService.queueWeezeventSyncType(
                        tenantId,
                        'prices',
                        { eventId: dto.eventId },
                    );
                    return { jobId: job.id, status: 'queued', syncType: 'prices' };
                }

                case 'attendees': {
                    if (!dto.eventId) throw new Error('eventId is required for attendees sync');
                    const job = await this.queueService.queueWeezeventSyncType(
                        tenantId,
                        'attendees',
                        { eventId: dto.eventId },
                    );
                    return { jobId: job.id, status: 'queued', syncType: 'attendees' };
                }

                default:
                    throw new Error(`Sync type ${dto.type} not yet implemented`);
            }
        } catch (error) {
            if (!isRedisUnavailable(error as Error)) throw error;

            // ─── Redis quota / connection error → run sync in-process ───────────
            this.logger.warn(
                `Redis queue unavailable (${(error as Error).message}). ` +
                `Falling back to direct in-process sync for tenant ${tenantId}.`,
            );

            switch (dto.type) {
                case 'transactions':
                    return runDirectSync(
                        () => this.incrementalSyncService.syncTransactionsIncremental(tenantId, {
                            forceFullSync: dto.full,
                            updatedSince: fromDate,
                        }),
                        'transactions',
                    );
                case 'events':
                    return runDirectSync(
                        () => this.incrementalSyncService.syncEventsIncremental(tenantId, {
                            forceFullSync: dto.full,
                        }),
                        'events',
                    );
                case 'products':
                    return runDirectSync(
                        () => this.syncService.syncProducts(tenantId),
                        'products',
                    );
                default:
                    throw Object.assign(
                        new Error(`Redis unavailable and no direct fallback for sync type '${dto.type}'.`),
                        { status: 503 },
                    );
            }
        }
    }

    /**
     * Get sync status (including incremental state + BullMQ queue stats)
     */
    @Get('sync/status')
    @ApiOperation({ summary: 'Obtenir le statut de synchronisation Weezevent' })
    @ApiResponse({ status: 200, description: 'Statut des synchronisations Weezevent' })
    async getSyncStatus(@CurrentUser() user: any) {
        const tenantId = user.tenantId;

        const [incrementalStatus, transactionCount, eventCount, productCount, queueStats, jobsProgress] =
            await Promise.all([
                this.incrementalSyncService.getSyncStatus(tenantId),
                this.prisma.weezeventTransaction.count({ where: { tenantId } }),
                this.prisma.weezeventEvent.count({ where: { tenantId } }),
                this.prisma.weezeventProduct.count({ where: { tenantId } }),
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
    @ApiQuery({ name: 'type', required: false, type: String, description: 'Type de sync à réinitialiser' })
    @ApiResponse({ status: 200, description: 'État de synchronisation réinitialisé' })
    async resetSyncState(
        @CurrentUser() user: any,
        @Query('type') syncType?: string,
    ) {
        const tenantId = user.tenantId;
        this.logger.log(`Resetting sync state for tenant ${tenantId}${syncType ? ` (type: ${syncType})` : ''}`);
        
        await this.incrementalSyncService.resetSyncState(tenantId, syncType);
        
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
    @ApiResponse({ status: 200, description: 'Données supprimées' })
    async purgeData(@CurrentUser() user: any) {
        const tenantId = user.tenantId;
        this.logger.warn(`Purging all Weezevent data for tenant ${tenantId}`);

        const where = { tenantId };

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
            this.prisma.weezeventTransactionItem.deleteMany({ where: { transaction: { tenantId } } }),
            this.prisma.weezeventTransaction.deleteMany({ where }),
            this.prisma.weezeventProductMapping.deleteMany({ where }),
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
    @ApiResponse({ status: 200, description: 'Liste paginée des événements Weezevent' })
    async getEvents(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 50,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 50, 200);
        const [events, total] = await Promise.all([
            this.prisma.weezeventEvent.findMany({
                where: { tenantId },
                orderBy: { startDate: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventEvent.count({ where: { tenantId } }),
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
    @ApiResponse({ status: 200, description: 'Liste des locations Weezevent' })
    async getLocations(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('type') type?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        // By default only return sale locations (physical F&B stands).
        // Pass type=all to get every type, or type=topup etc. for a specific one.
        const where: any = { tenantId };
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
    @ApiResponse({ status: 200, description: 'Liste des merchants Weezevent' })
    async getMerchants(
        @CurrentUser() user: any,
        @Query('page') page: any = 1,
        @Query('perPage') perPage: any = 100,
        @Query('locationId') locationId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = parseInt(page, 10) || 1;
        const pp = Math.min(parseInt(perPage, 10) || 100, 500);

        // If locationId provided, find merchants via transactions at that location
        if (locationId) {
            const merchantIds = await this.prisma.weezeventTransaction.findMany({
                where: { tenantId, locationId, merchantId: { not: null } },
                select: { merchantId: true },
                distinct: ['merchantId'],
            });
            const ids = merchantIds.map(m => m.merchantId).filter(Boolean);

            if (ids.length > 0) {
                const merchants = await this.prisma.weezeventMerchant.findMany({
                    where: { tenantId, id: { in: ids } },
                    orderBy: { name: 'asc' },
                });
                return { data: merchants, meta: { total: merchants.length } };
            }
            // Fallback: no transactions at this location yet — return all tenant merchants
        }

        const [merchants, total] = await Promise.all([
            this.prisma.weezeventMerchant.findMany({
                where: { tenantId },
                orderBy: { name: 'asc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.weezeventMerchant.count({ where: { tenantId } }),
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
    @ApiResponse({ status: 200, description: 'Liste paginée des produits Weezevent' })
    async getProducts(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('category') category?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
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
    @ApiResponse({ status: 200, description: 'Liste paginée des commandes Weezevent' })
    async getOrders(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
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
    @ApiResponse({ status: 200, description: 'Liste paginée des tarifs Weezevent' })
    async getPrices(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
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
    @ApiResponse({ status: 200, description: 'Liste paginée des participants Weezevent' })
    async getAttendees(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
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
