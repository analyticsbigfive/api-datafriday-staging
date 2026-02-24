import { Injectable, Logger } from '@nestjs/common';
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
