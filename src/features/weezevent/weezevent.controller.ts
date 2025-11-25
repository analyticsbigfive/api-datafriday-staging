import { Controller, Get, Post, Body, Query, Param, UseGuards, Logger } from '@nestjs/common';
import { WeezeventSyncService, SyncResult } from './services/weezevent-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';

@Controller('weezevent')
@UseGuards(JwtDatabaseGuard)
export class WeezeventController {
    private readonly logger = new Logger(WeezeventController.name);

    constructor(
        private readonly syncService: WeezeventSyncService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Get synced transactions from database
     */
    @Get('transactions')
    async getTransactions(
        @Query() query: GetTransactionsQueryDto,
        @Param('tenantId') tenantId: string,
    ) {
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
        @Param('id') id: string,
        @Param('tenantId') tenantId: string,
    ) {
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
     * Trigger manual synchronization
     */
    @Post('sync')
    async syncData(
        @Body() dto: SyncWeezeventDto,
        @Param('tenantId') tenantId: string,
        @Param('organizationId') organizationId: string,
    ): Promise<SyncResult> {
        this.logger.log(
            `Manual sync triggered: type=${dto.type}, tenant=${tenantId}, org=${organizationId}`,
        );

        const fromDate = dto.fromDate ? new Date(dto.fromDate) : undefined;
        const toDate = dto.toDate ? new Date(dto.toDate) : undefined;

        switch (dto.type) {
            case 'transactions':
                return this.syncService.syncTransactions(tenantId, organizationId, {
                    fromDate,
                    toDate,
                    full: dto.full,
                    eventId: dto.eventId,
                });

            case 'events':
                return this.syncService.syncEvents(tenantId, organizationId);

            case 'products':
                return this.syncService.syncProducts(tenantId, organizationId);

            default:
                throw new Error(`Sync type ${dto.type} not yet implemented`);
        }
    }

    /**
     * Get sync status
     */
    @Get('sync/status')
    async getSyncStatus(@Param('tenantId') tenantId: string) {
        // Get last sync time for each type
        const [lastTransaction, lastEvent, lastProduct] = await Promise.all([
            this.prisma.weezeventTransaction.findFirst({
                where: { tenantId },
                orderBy: { syncedAt: 'desc' },
                select: { syncedAt: true },
            }),
            this.prisma.weezeventEvent.findFirst({
                where: { tenantId },
                orderBy: { syncedAt: 'desc' },
                select: { syncedAt: true },
            }),
            this.prisma.weezeventProduct.findFirst({
                where: { tenantId },
                orderBy: { syncedAt: 'desc' },
                select: { syncedAt: true },
            }),
        ]);

        // Get counts
        const [transactionCount, eventCount, productCount] = await Promise.all([
            this.prisma.weezeventTransaction.count({ where: { tenantId } }),
            this.prisma.weezeventEvent.count({ where: { tenantId } }),
            this.prisma.weezeventProduct.count({ where: { tenantId } }),
        ]);

        return {
            lastSync: {
                transactions: lastTransaction?.syncedAt,
                events: lastEvent?.syncedAt,
                products: lastProduct?.syncedAt,
            },
            counts: {
                transactions: transactionCount,
                events: eventCount,
                products: productCount,
            },
            isRunning: false, // TODO: Track running syncs
        };
    }

    /**
     * Get events
     */
    @Get('events')
    async getEvents(
        @Param('tenantId') tenantId: string,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
    ) {
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
        @Param('tenantId') tenantId: string,
        @Query('page') page: number = 1,
        @Query('perPage') perPage: number = 50,
        @Query('category') category?: string,
    ) {
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
}
