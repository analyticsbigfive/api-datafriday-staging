import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';

@Controller('weezevent/analytics')
@UseGuards(JwtDatabaseGuard)
export class WeezeventAnalyticsController {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Get sales by product
     */
    @Get('sales-by-product')
    async getSalesByProduct(
        @CurrentUser() user: any,
        @Query('eventId') eventId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };

        if (eventId) where.eventId = eventId;
        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        // Get transactions with items
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where,
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });

        // Aggregate by product
        const productSales = new Map<string, {
            productId: string;
            productName: string;
            quantity: number;
            totalAmount: number;
            transactionCount: number;
        }>();

        for (const transaction of transactions) {
            for (const item of transaction.items) {
                const productId = item.productId || 'unknown';
                const productName = item.productName || 'Unknown Product';

                if (!productSales.has(productId)) {
                    productSales.set(productId, {
                        productId,
                        productName,
                        quantity: 0,
                        totalAmount: 0,
                        transactionCount: 0,
                    });
                }

                const stats = productSales.get(productId)!;
                stats.quantity += item.quantity;
                stats.totalAmount += Number(item.unitPrice) * item.quantity;
                stats.transactionCount++;
            }
        }

        return {
            data: Array.from(productSales.values()).sort((a, b) => b.totalAmount - a.totalAmount),
            meta: {
                total: productSales.size,
                fromDate,
                toDate,
                eventId,
            },
        };
    }

    /**
     * Get sales by event
     */
    @Get('sales-by-event')
    async getSalesByEvent(
        @CurrentUser() user: any,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };

        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        // Get transactions grouped by event
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where,
            include: {
                event: true,
                items: true,
            },
        });

        // Aggregate by event
        const eventSales = new Map<string, {
            eventId: string;
            eventName: string;
            totalAmount: number;
            transactionCount: number;
            itemCount: number;
        }>();

        for (const transaction of transactions) {
            const eventId = transaction.eventId || 'unknown';
            const eventName = transaction.eventName || 'Unknown Event';

            if (!eventSales.has(eventId)) {
                eventSales.set(eventId, {
                    eventId,
                    eventName,
                    totalAmount: 0,
                    transactionCount: 0,
                    itemCount: 0,
                });
            }

            const stats = eventSales.get(eventId)!;
            stats.totalAmount += Number(transaction.amount);
            stats.transactionCount++;
            stats.itemCount += transaction.items.length;
        }

        return {
            data: Array.from(eventSales.values()).sort((a, b) => b.totalAmount - a.totalAmount),
            meta: {
                total: eventSales.size,
                fromDate,
                toDate,
            },
        };
    }

    /**
     * Get margin analysis (sales vs costs)
     */
    @Get('margin-analysis')
    async getMarginAnalysis(
        @CurrentUser() user: any,
        @Query('eventId') eventId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };

        if (eventId) where.eventId = eventId;
        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        // Get transactions with items and product mappings
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where,
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                mappings: {
                                    include: {
                                        menuItem: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Calculate sales and costs
        let totalSales = 0;
        let totalCost = 0;
        let mappedItems = 0;
        let unmappedItems = 0;

        const productMargins: any[] = [];

        for (const transaction of transactions) {
            for (const item of transaction.items) {
                const sales = Number(item.unitPrice) * item.quantity;
                totalSales += sales;

                // Check if product is mapped to a menu item
                const mapping = item.product?.mappings?.[0];
                if (mapping?.menuItem) {
                    const menuItemCost = Number(mapping.menuItem.totalCost || 0);
                    const itemCost = menuItemCost * item.quantity;
                    totalCost += itemCost;
                    mappedItems++;

                    productMargins.push({
                        productId: item.productId,
                        productName: item.productName,
                        menuItemId: mapping.menuItemId,
                        menuItemName: mapping.menuItem.name,
                        quantity: item.quantity,
                        sales,
                        cost: itemCost,
                        margin: sales - itemCost,
                        marginPercent: sales > 0 ? ((sales - itemCost) / sales) * 100 : 0,
                    });
                } else {
                    unmappedItems++;
                }
            }
        }

        const totalMargin = totalSales - totalCost;
        const marginPercent = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;

        return {
            summary: {
                totalSales,
                totalCost,
                totalMargin,
                marginPercent: Math.round(marginPercent * 100) / 100,
                mappedItems,
                unmappedItems,
                mappingRate: mappedItems + unmappedItems > 0 
                    ? Math.round((mappedItems / (mappedItems + unmappedItems)) * 100) 
                    : 0,
            },
            productMargins: productMargins.sort((a, b) => b.margin - a.margin),
            meta: {
                fromDate,
                toDate,
                eventId,
            },
        };
    }

    /**
     * Get top products by revenue
     */
    @Get('top-products')
    async getTopProducts(
        @CurrentUser() user: any,
        @Query('limit') limit: number = 10,
        @Query('eventId') eventId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        const tenantId = user.tenantId;
        const where: any = { tenantId };

        if (eventId) where.eventId = eventId;
        if (fromDate || toDate) {
            where.transactionDate = {};
            if (fromDate) where.transactionDate.gte = new Date(fromDate);
            if (toDate) where.transactionDate.lte = new Date(toDate);
        }

        // Get transactions with items
        const transactions = await this.prisma.weezeventTransaction.findMany({
            where,
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });

        // Aggregate by product
        const productStats = new Map<string, {
            productId: string;
            productName: string;
            category: string | null;
            quantity: number;
            revenue: number;
            averagePrice: number;
        }>();

        for (const transaction of transactions) {
            for (const item of transaction.items) {
                const productId = item.productId || 'unknown';
                const productName = item.productName || 'Unknown Product';
                const category = item.product?.category || null;

                if (!productStats.has(productId)) {
                    productStats.set(productId, {
                        productId,
                        productName,
                        category,
                        quantity: 0,
                        revenue: 0,
                        averagePrice: 0,
                    });
                }

                const stats = productStats.get(productId)!;
                stats.quantity += item.quantity;
                stats.revenue += Number(item.unitPrice) * item.quantity;
            }
        }

        // Calculate average price
        for (const stats of productStats.values()) {
            stats.averagePrice = stats.quantity > 0 ? stats.revenue / stats.quantity : 0;
        }

        const topProducts = Array.from(productStats.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);

        return {
            data: topProducts,
            meta: {
                total: productStats.size,
                limit,
                fromDate,
                toDate,
                eventId,
            },
        };
    }
}
