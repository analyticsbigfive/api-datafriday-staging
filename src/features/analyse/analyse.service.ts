import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AnalyseService {
  private readonly logger = new Logger(AnalyseService.name);

  constructor(private prisma: PrismaService) {}

  async getDashboard(tenantId: string) {
    this.logger.log(`Getting dashboard for tenant ${tenantId}`);

    const [
      menuItemCount,
      componentCount,
      ingredientCount,
      supplierCount,
      eventCount,
      spaceCount,
    ] = await Promise.all([
      this.prisma.menuItem.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.menuComponent.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.ingredient.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.supplier.count({ where: { tenantId } }),
      this.prisma.event.count({ where: { tenantId } }),
      this.prisma.space.count({ where: { tenantId } }),
    ]);

    return {
      menuItems: menuItemCount,
      components: componentCount,
      ingredients: ingredientCount,
      suppliers: supplierCount,
      events: eventCount,
      spaces: spaceCount,
    };
  }

  async getMenuKpis(tenantId: string) {
    this.logger.log(`Getting menu KPIs for tenant ${tenantId}`);

    const items = await this.prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null },
      select: { basePrice: true, totalCost: true, margin: true, typeId: true, categoryId: true },
    });

    const totalItems = items.length;
    const avgPrice = totalItems > 0
      ? items.reduce((s, i) => s + (Number(i.basePrice) || 0), 0) / totalItems
      : 0;
    const avgCost = totalItems > 0
      ? items.reduce((s, i) => s + (Number(i.totalCost) || 0), 0) / totalItems
      : 0;
    const avgMargin = totalItems > 0
      ? items.reduce((s, i) => s + (Number(i.margin) || 0), 0) / totalItems
      : 0;

    const lowMarginItems = items.filter(i => Number(i.margin) > 0 && Number(i.margin) < 30).length;
    const highMarginItems = items.filter(i => Number(i.margin) >= 60).length;

    const byType: Record<string, number> = {};
    for (const i of items) {
      const key = i.typeId || 'unclassified';
      byType[key] = (byType[key] || 0) + 1;
    }

    return {
      totalItems,
      avgPrice: Math.round(avgPrice * 100) / 100,
      avgCost: Math.round(avgCost * 100) / 100,
      avgMargin: Math.round(avgMargin * 100) / 100,
      lowMarginItems,
      highMarginItems,
      byType,
    };
  }

  async getEventKpis(tenantId: string) {
    this.logger.log(`Getting event KPIs for tenant ${tenantId}`);

    const events = await this.prisma.event.findMany({
      where: { tenantId },
      select: { revenue: true, transactionCount: true, eventDate: true, status: true },
      orderBy: { eventDate: 'desc' },
    });

    const totalEvents = events.length;
    const totalRevenue = events.reduce((s, e) => s + (Number(e.revenue) || 0), 0);
    const avgRevenue = totalEvents > 0 ? totalRevenue / totalEvents : 0;
    const totalTransactions = events.reduce((s, e) => s + (e.transactionCount || 0), 0);

    const upcoming = events.filter(e => new Date(e.eventDate) > new Date()).length;
    const completed = events.filter(e => e.status === 'success' || e.status === 'completed').length;

    return {
      totalEvents,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgRevenue: Math.round(avgRevenue * 100) / 100,
      totalTransactions,
      upcoming,
      completed,
    };
  }

  async getTimeline(
    eventId: string,
    tenantId: string,
    opts: {
      startTime?: string;
      endTime?: string;
      shopId?: string;
      menuItemId?: string;
      limit?: number;
    } = {},
  ) {
    this.logger.log(`GET /analyse/timeline eventId=${eventId} tenant=${tenantId}`);

    const limit = Math.min(opts.limit ?? 1000, 5000);

    const shopFilter = opts.shopId
      ? Prisma.sql`AND t."merchantId" = ${opts.shopId}`
      : Prisma.sql``;

    const menuItemFilter = opts.menuItemId
      ? Prisma.sql`AND wpm."menuItemId" = ${opts.menuItemId}`
      : Prisma.sql``;

    // HH:MM filters applied against the minute dimension
    const startTimeFilter = opts.startTime
      ? Prisma.sql`AND TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI') >= ${opts.startTime}`
      : Prisma.sql``;

    const endTimeFilter = opts.endTime
      ? Prisma.sql`AND TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI') <= ${opts.endTime}`
      : Prisma.sql``;

    const rows: any[] = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        ${eventId}::text                                                              AS "eventId",
        TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI')               AS minute,
        EXTRACT(HOUR FROM t."transactionDate")::integer                              AS hour,
        t."merchantId"                                                               AS "shopId",
        COALESCE(m.name, t."merchantName")                                          AS "shopName",
        ti."productId"                                                               AS "weezeventProductId",
        wpm."menuItemId",
        COALESCE(mi.name, ti."productName")                                         AS "menuItemName",
        SUM(ti.quantity)::integer                                                    AS quantity,
        COUNT(DISTINCT t.id)::integer                                               AS "transactionCount",
        SUM(ti."unitPrice" * ti.quantity / (1 + COALESCE(p."vatRate", 20) / 100))::numeric(12,2) AS revenue
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti
        ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventMerchant" m
        ON m.id = t."merchantId" AND m."tenantId" = ${tenantId}
      LEFT JOIN "WeezeventProduct" p
        ON p.id = ti."productId"
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = ${tenantId}
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      WHERE t."tenantId" = ${tenantId}
        AND t."eventId"  = ${eventId}
        AND t.status = 'V'
        ${shopFilter}
        ${menuItemFilter}
        ${startTimeFilter}
        ${endTimeFilter}
      GROUP BY
        DATE_TRUNC('minute', t."transactionDate"),
        t."merchantId", m.name, t."merchantName",
        ti."productId", wpm."menuItemId", mi.name, ti."productName",
        p."vatRate"
      ORDER BY minute ASC
      LIMIT ${limit}
    `);

    return rows.map((r: any) => ({
      eventId: r.eventId,
      shopId: r.shopId ?? null,
      shopName: r.shopName ?? null,
      weezeventProductId: r.weezeventProductId ?? null,
      menuItemId: r.menuItemId ?? null,
      menuItemName: r.menuItemName ?? null,
      hour: Number(r.hour ?? 0),
      minute: r.minute ?? null,
      quantity: Number(r.quantity ?? 0),
      transactionCount: Number(r.transactionCount ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  }

  async getCostBreakdown(tenantId: string) {
    this.logger.log(`Getting cost breakdown for tenant ${tenantId}`);

    const items = await this.prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, name: true, basePrice: true, totalCost: true, margin: true,
        productType: { select: { name: true } },
        productCategory: { select: { name: true } },
      },
      orderBy: { margin: 'asc' },
      take: 20,
    });

    return items.map(i => ({
      id: i.id,
      name: i.name,
      basePrice: Number(i.basePrice) || 0,
      totalCost: Number(i.totalCost) || 0,
      margin: Number(i.margin) || 0,
      type: i.productType?.name || 'N/A',
      category: i.productCategory?.name || 'N/A',
    }));
  }
}
