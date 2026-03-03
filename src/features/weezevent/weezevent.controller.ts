import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, Logger } from '@nestjs/common';
import { WeezeventSyncService, SyncResult } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService, IncrementalSyncResult } from './services/weezevent-incremental-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SyncTrackerService } from './services/sync-tracker.service';

@Controller('weezevent')
@UseGuards(JwtDatabaseGuard)
export class WeezeventController {
    private readonly logger = new Logger(WeezeventController.name);

    constructor(
        private readonly syncService: WeezeventSyncService,
        private readonly incrementalSyncService: WeezeventIncrementalSyncService,
        private readonly prisma: PrismaService,
        private readonly syncTracker: SyncTrackerService,
    ) { }

    /**
     * Get synced transactions from database
     */
    @Get('transactions')
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
    async syncData(
        @CurrentUser() user: any,
        @Body() dto: SyncWeezeventDto,
    ): Promise<SyncResult | IncrementalSyncResult> {
        const tenantId = user.tenantId;
        this.logger.log(
            `Manual sync triggered: type=${dto.type}, tenant=${tenantId}, forceFullSync=${dto.full || false}`,
        );

        const fromDate = dto.fromDate ? new Date(dto.fromDate) : undefined;
        const toDate = dto.toDate ? new Date(dto.toDate) : undefined;

        switch (dto.type) {
            case 'transactions':
                // Use incremental sync service
                return this.incrementalSyncService.syncTransactionsIncremental(tenantId, {
                    forceFullSync: dto.full,
                    updatedSince: fromDate,
                    batchSize: 500,
                    maxItems: 10000,
                });

            case 'events':
                // Use incremental sync service
                return this.incrementalSyncService.syncEventsIncremental(tenantId, {
                    forceFullSync: dto.full,
                    batchSize: 500,
                    maxItems: 10000,
                });

            case 'products':
                // Products use regular sync (usually small dataset)
                return this.syncService.syncProducts(tenantId);

            case 'orders':
                if (!dto.eventId) {
                    throw new Error('eventId is required for orders sync');
                }
                return this.syncService.syncOrders(tenantId, dto.eventId);

            case 'prices':
                return this.syncService.syncPrices(tenantId, dto.eventId);

            case 'attendees':
                if (!dto.eventId) {
                    throw new Error('eventId is required for attendees sync');
                }
                return this.syncService.syncAttendees(tenantId, dto.eventId);

            default:
                throw new Error(`Sync type ${dto.type} not yet implemented`);
        }
    }

    /**
     * Get sync status (including incremental state)
     */
    @Get('sync/status')
    async getSyncStatus(@CurrentUser() user: any) {
        const tenantId = user.tenantId;

        // Get incremental sync states
        const incrementalStatus = await this.incrementalSyncService.getSyncStatus(tenantId);

        // Get counts
        const [transactionCount, eventCount, productCount] = await Promise.all([
            this.prisma.weezeventTransaction.count({ where: { tenantId } }),
            this.prisma.weezeventEvent.count({ where: { tenantId } }),
            this.prisma.weezeventProduct.count({ where: { tenantId } }),
        ]);

        return {
            // Incremental sync states
            events: {
                ...incrementalStatus.events,
                count: eventCount,
            },
            transactions: {
                ...incrementalStatus.transactions,
                count: transactionCount,
            },
            products: {
                ...incrementalStatus.products,
                count: productCount,
            },
            // Running syncs
            runningSyncs: this.syncTracker.getRunningSyncs(tenantId),
            isRunning: this.syncTracker.getRunningSyncs(tenantId).length > 0,
        };
    }

    /**
     * Reset sync state (force full sync next time)
     */
    @Delete('sync/state')
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
     * Get events
     */
    @Get('events')
    async getEvents(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
    ) {
        const tenantId = user.tenantId;
        const [events, total] = await Promise.all([
            this.prisma.weezeventEvent.findMany({
                where: { tenantId },
                orderBy: { startDate: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventEvent.count({ where: { tenantId } }),
        ]);

        return {
            data: events,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Get products
     */
    @Get('products')
    async getProducts(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('category') category?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
        if (category) where.category = category;

        const [products, total] = await Promise.all([
            this.prisma.weezeventProduct.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventProduct.count({ where }),
        ]);

        return {
            data: products,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Map a Weezevent product to a MenuItem
     */
    @Post('products/:productId/map')
    async mapProductToMenuItem(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() body: { menuItemId: string; autoMapped?: boolean; confidence?: number },
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
    async getProductMappings(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
    ) {
        const tenantId = user.tenantId;

        const [mappings, total] = await Promise.all([
            this.prisma.weezeventProductMapping.findMany({
                where: { tenantId },
                include: {
                    weezeventProduct: true,
                    menuItem: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
        ]);

        return {
            data: mappings,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Delete a product mapping
     */
    @Delete('products/:productId/map')
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
    async getOrders(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
        if (eventId) where.eventId = eventId;

        const [orders, total] = await Promise.all([
            this.prisma.weezeventOrder.findMany({
                where,
                orderBy: { orderDate: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventOrder.count({ where }),
        ]);

        return {
            data: orders,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Get prices
     */
    @Get('prices')
    async getPrices(
        @CurrentUser() user: any,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('eventId') eventId?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };
        if (eventId) where.eventId = eventId;

        const [prices, total] = await Promise.all([
            this.prisma.weezeventPrice.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            this.prisma.weezeventPrice.count({ where }),
        ]);

        return {
            data: prices,
            meta: {
                current_page: page,
                per_page: perPage,
                total,
                total_pages: Math.ceil(total / perPage),
            },
        };
    }

    /**
     * Get attendees
     */
    @Get('attendees')
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
