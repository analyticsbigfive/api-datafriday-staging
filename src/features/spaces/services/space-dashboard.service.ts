import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import {
  DashboardQueryDto,
  DashboardResponseDto,
  DashboardMetaDto,
  SpaceInfoDto,
  FiltersDto,
  KpisDto,
  ChartsDto,
  ListsDto,
  DashboardInclude,
  DashboardGranularity,
} from '../dto';
import { createHash } from 'crypto';

@Injectable()
export class SpaceDashboardService {
  private readonly logger = new Logger(SpaceDashboardService.name);
  private readonly CACHE_TTL = 120; // 2 minutes
  private readonly CACHE_PREFIX = 'dash:v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getDashboard(
    spaceId: string,
    tenantId: string,
    query: DashboardQueryDto,
  ): Promise<DashboardResponseDto> {
    const startTime = Date.now();

    // Verify space belongs to tenant
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      include: { configs: true },
    });

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    // Get dashboard version for cache key
    const version = await this.getDashboardVersion(spaceId, tenantId);

    // Build cache key
    const cacheKey = this.buildCacheKey(
      tenantId,
      spaceId,
      query,
      version.version,
    );

    // Try to get from cache
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(
        `Cache hit for space ${spaceId} (${Date.now() - startTime}ms)`,
      );
      return cached;
    }

    // Cache miss - compute dashboard
    this.logger.log(`Cache miss for space ${spaceId}, computing...`);

    const { from, to } = this.getDateRange(query);
    const include = query.include || [];

    const response: DashboardResponseDto = {
      meta: this.buildMeta(
        spaceId,
        tenantId,
        from,
        to,
        query,
        version.version,
        false,
      ),
    };

    // Build response based on include parameter
    if (include.includes(DashboardInclude.SPACE)) {
      response.space = this.buildSpaceInfo(space);
    }

    if (include.includes(DashboardInclude.FILTERS)) {
      response.filters = await this.getFilters(spaceId, tenantId, from, to);
    }

    if (include.includes(DashboardInclude.KPIS)) {
      response.kpis = await this.getKpis(spaceId, tenantId, from, to);
    }

    if (include.includes(DashboardInclude.CHARTS)) {
      response.charts = await this.getCharts(
        spaceId,
        tenantId,
        from,
        to,
        query.granularity || DashboardGranularity.DAY,
      );
    }

    if (include.includes(DashboardInclude.LISTS)) {
      response.lists = await this.getLists(spaceId, tenantId, from, to);
    }

    // Cache the response
    await this.setCache(cacheKey, response);

    const duration = Date.now() - startTime;
    this.logger.log(`Dashboard computed for space ${spaceId} in ${duration}ms`);

    return response;
  }

  private async getDashboardVersion(spaceId: string, tenantId: string) {
    let version = await this.prisma.spaceDashboardVersion.findUnique({
      where: { spaceId },
    });

    if (version && version.tenantId !== tenantId) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    if (!version) {
      version = await this.prisma.spaceDashboardVersion.create({
        data: { spaceId, tenantId, version: 1 },
      });
    }

    return version;
  }

  private buildCacheKey(
    tenantId: string,
    spaceId: string,
    query: DashboardQueryDto,
    version: number,
  ): string {
    const { from, to } = this.getDateRange(query);
    const filtersHash = this.hashFilters(query);
    const granularity = query.granularity || DashboardGranularity.DAY;
    const include = (query.include || []).sort().join(',');

    return `${this.CACHE_PREFIX}:${tenantId}:${spaceId}:${from}:${to}:${granularity}:${include}:${filtersHash}:${version}`;
  }

  private hashFilters(query: DashboardQueryDto): string {
    const filterData = JSON.stringify({
      configId: query.configId,
    });
    return createHash('md5').update(filterData).digest('hex').substring(0, 8);
  }

  private getDateRange(query: DashboardQueryDto): { from: string; to: string } {
    const now = new Date();
    const to = query.to || now.toISOString().split('T')[0];
    const from =
      query.from ||
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return { from, to };
  }

  private buildMeta(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
    query: DashboardQueryDto,
    version: number,
    cacheHit: boolean,
  ): DashboardMetaDto {
    return {
      spaceId,
      tenantId,
      from,
      to,
      granularity: query.granularity || DashboardGranularity.DAY,
      filtersHash: this.hashFilters(query),
      analyticsVersion: version,
      generatedAt: new Date().toISOString(),
      cache: {
        hit: cacheHit,
        ttlSeconds: this.CACHE_TTL,
      },
    };
  }

  private buildSpaceInfo(space: any): SpaceInfoDto {
    return {
      id: space.id,
      name: space.name,
      timezone: space.timezone || 'Europe/Paris',
      configs: space.configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity,
      })),
    };
  }

  private async getFilters(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<FiltersDto> {
    // Get location mapping for this space
    const locationMappings =
      await this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId, spaceId },
      });

    const locationIds = locationMappings.map((m) => m.weezeventLocationId);

    // Get events from transactions in date range
    const events = await this.prisma.weezeventEvent.findMany({
      where: {
        tenantId,
        transactions: {
          some: {
            locationId: { in: locationIds },
            transactionDate: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
      },
      distinct: ['id'],
    });

    // Get merchants from transactions
    const merchants = await this.prisma.weezeventMerchant.findMany({
      where: {
        tenantId,
        transactions: {
          some: {
            locationId: { in: locationIds },
            transactionDate: {
              gte: new Date(from),
              lte: new Date(to),
            },
          },
        },
      },
      select: {
        weezeventId: true,
        name: true,
      },
      distinct: ['weezeventId'],
    });

    // Get merchant-element mappings
    const merchantMappings =
      await this.prisma.weezeventMerchantElementMapping.findMany({
        where: {
          tenantId,
          weezeventMerchantId: { in: merchants.map((m) => m.weezeventId) },
        },
        select: {
          weezeventMerchantId: true,
          spaceElementId: true,
        },
      });

    const spaceElements = merchantMappings.length
      ? await this.prisma.spaceElement.findMany({
          where: {
            id: { in: merchantMappings.map((m) => m.spaceElementId) },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const spaceElementById = new Map(
      spaceElements.map((element) => [element.id, element]),
    );

    // Get locations
    const locations = await this.prisma.weezeventLocation.findMany({
      where: {
        weezeventId: { in: locationIds },
      },
      select: {
        weezeventId: true,
        name: true,
      },
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        startDate: e.startDate?.toISOString() || null,
      })),
      shops: merchantMappings
        .map((m) => ({
          spaceElementId: m.spaceElementId,
          spaceElement: spaceElementById.get(m.spaceElementId),
        }))
        .filter(
          (
            m,
          ): m is {
            spaceElementId: string;
            spaceElement: { id: string; name: string };
          } => Boolean(m.spaceElement),
        )
        .map((m) => ({
          spaceElementId: m.spaceElementId,
          name: m.spaceElement.name,
        })),
      weezevent: {
        locations: locations.map((l) => ({
          weezeventLocationId: l.weezeventId,
          name: l.name,
        })),
        merchants: merchants.map((m) => ({
          weezeventMerchantId: m.weezeventId,
          name: m.name,
        })),
      },
    };
  }

  private async getKpis(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<KpisDto> {
    const aggregates = await this.prisma.spaceRevenueDailyAgg.aggregate({
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
        transactionsCount: true,
        itemsCount: true,
      },
    });

    const totalRevenue = Number(aggregates._sum.revenueHt || 0);
    const totalTransactions = aggregates._sum.transactionsCount || 0;
    const avgTicket =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // TODO: Get attendees from WeezeventAttendee table
    const attendees = 0;
    const revenuePerAttendee = attendees > 0 ? totalRevenue / attendees : 0;
    const conversionRate = 0; // TODO: Calculate from attendees vs transactions

    // Get top category
    const topCategory = await this.getTopCategory(spaceId, tenantId, from, to);

    return {
      revenueHt: totalRevenue,
      transactions: totalTransactions,
      avgTicketHt: avgTicket,
      attendees,
      revenuePerAttendee,
      conversionRate,
      topSellingCategory: topCategory,
      refundRate: 0, // TODO: Calculate refund rate
    };
  }

  private async getTopCategory(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<string | null> {
    const topProduct = await this.prisma.spaceProductRevenueDailyAgg.groupBy({
      by: ['weezeventProductId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 1,
    });

    if (topProduct.length === 0) return null;

    const product = await this.prisma.weezeventProduct.findUnique({
      where: { id: topProduct[0].weezeventProductId },
      select: { category: true },
    });

    return product?.category || null;
  }

  private async getCharts(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
    granularity: DashboardGranularity,
  ): Promise<ChartsDto> {
    // Get revenue over time
    const revenueData = await this.prisma.spaceRevenueDailyAgg.groupBy({
      by: ['day'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        day: 'asc',
      },
    });

    const labels = revenueData.map((d) => d.day.toISOString().split('T')[0]);
    const values = revenueData.map((d) => Number(d._sum.revenueHt || 0));

    // Get revenue by shop
    const shopData = await this.prisma.spaceRevenueDailyAgg.groupBy({
      by: ['day', 'spaceElementId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
        spaceElementId: { not: null },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        day: 'asc',
      },
    });

    // Group by shop
    const shopSeries = new Map<string, { label: string; values: number[] }>();
    
    for (const data of shopData) {
      if (!data.spaceElementId) continue;
      
      if (!shopSeries.has(data.spaceElementId)) {
        const element = await this.prisma.spaceElement.findUnique({
          where: { id: data.spaceElementId },
          select: { name: true },
        });
        
        shopSeries.set(data.spaceElementId, {
          label: element?.name || 'Unknown',
          values: new Array(labels.length).fill(0),
        });
      }
      
      const dayIndex = labels.indexOf(data.day.toISOString().split('T')[0]);
      if (dayIndex >= 0) {
        shopSeries.get(data.spaceElementId)!.values[dayIndex] = Number(
          data._sum.revenueHt || 0,
        );
      }
    }

    return {
      revenueOverTime: {
        labels,
        series: [
          {
            key: 'total',
            label: 'Total',
            values,
          },
        ],
      },
      revenueByShopOverTime: {
        labels,
        series: Array.from(shopSeries.entries()).map(([id, data]) => ({
          key: `shop:${id}`,
          label: data.label,
          values: data.values,
        })),
      },
    };
  }

  private async getLists(
    spaceId: string,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<ListsDto> {
    // Top shops
    const topShops = await this.prisma.spaceRevenueDailyAgg.groupBy({
      by: ['spaceElementId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
        spaceElementId: { not: null },
      },
      _sum: {
        revenueHt: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 10,
    });

    const topShopsWithNames = await Promise.all(
      topShops.map(async (shop) => {
        const element = await this.prisma.spaceElement.findUnique({
          where: { id: shop.spaceElementId! },
          select: { name: true },
        });
        return {
          spaceElementId: shop.spaceElementId!,
          name: element?.name || 'Unknown',
          revenueHt: Number(shop._sum.revenueHt || 0),
        };
      }),
    );

    // Top products
    const topProducts = await this.prisma.spaceProductRevenueDailyAgg.groupBy({
      by: ['weezeventProductId'],
      where: {
        tenantId,
        spaceId,
        day: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      _sum: {
        revenueHt: true,
        quantity: true,
      },
      orderBy: {
        _sum: {
          revenueHt: 'desc',
        },
      },
      take: 10,
    });

    const topProductsWithNames = await Promise.all(
      topProducts.map(async (product) => {
        const prod = await this.prisma.weezeventProduct.findUnique({
          where: { id: product.weezeventProductId },
          select: { name: true },
        });
        return {
          weezeventProductId: product.weezeventProductId,
          name: prod?.name || 'Unknown',
          revenueHt: Number(product._sum.revenueHt || 0),
          quantity: product._sum.quantity || 0,
        };
      }),
    );

    return {
      topShops: topShopsWithNames,
      topProducts: topProductsWithNames,
    };
  }

  private async getFromCache(
    key: string,
  ): Promise<DashboardResponseDto | null> {
    try {
      const cached = await this.redis.get<DashboardResponseDto>(key);
      if (!cached) return null;

      cached.meta.cache.hit = true;
      return cached;
    } catch (error) {
      this.logger.warn(`Cache read error: ${error.message}`);
      return null;
    }
  }

  private async setCache(
    key: string,
    data: DashboardResponseDto,
  ): Promise<void> {
    try {
      await this.redis.set(key, data, { ttl: this.CACHE_TTL });
    } catch (error) {
      this.logger.warn(`Cache write error: ${error.message}`);
    }
  }

  async invalidateCache(spaceId: string, tenantId: string): Promise<number> {
    try {
      const pattern = `${this.CACHE_PREFIX}:${tenantId}:${spaceId}:*`;
      return this.redis.deletePattern(pattern);
    } catch (error) {
      this.logger.error(`Cache invalidation error: ${error.message}`);
      return 0;
    }
  }

  async incrementVersion(spaceId: string, tenantId: string): Promise<void> {
    await this.prisma.spaceDashboardVersion.upsert({
      where: { spaceId },
      create: {
        spaceId,
        tenantId,
        version: 1,
      },
      update: {
        version: { increment: 1 },
      },
    });
  }
}
