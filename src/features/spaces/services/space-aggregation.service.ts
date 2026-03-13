import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

interface AggregationJobParams {
  tenantId: string;
  spaceId?: string;
  fromDate: Date;
  toDate: Date;
  jobType: 'full' | 'incremental' | 'rebuild';
}

@Injectable()
export class SpaceAggregationService {
  private readonly logger = new Logger(SpaceAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runAggregation(params: AggregationJobParams): Promise<void> {
    const { tenantId, spaceId, fromDate, toDate, jobType } = params;

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId: spaceId || null,
        jobType,
        status: 'running',
        fromDate,
        toDate,
        transactionsProcessed: 0,
      },
    });

    try {
      this.logger.log(
        `Starting ${jobType} aggregation for tenant ${tenantId}${spaceId ? ` space ${spaceId}` : ''} from ${fromDate.toISOString()} to ${toDate.toISOString()}`,
      );

      let transactionsProcessed = 0;

      if (spaceId) {
        transactionsProcessed = await this.aggregateForSpace(
          tenantId,
          spaceId,
          fromDate,
          toDate,
        );
      } else {
        transactionsProcessed = await this.aggregateForTenant(
          tenantId,
          fromDate,
          toDate,
        );
      }

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          transactionsProcessed,
        },
      });

      this.logger.log(
        `Aggregation completed: ${transactionsProcessed} transactions processed`,
      );
    } catch (error) {
      this.logger.error(`Aggregation failed: ${error.message}`, error.stack);

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: error.message,
          retryCount: { increment: 1 },
        },
      });

      throw error;
    }
  }

  private async aggregateForTenant(
    tenantId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    const spaceMappings =
      await this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId },
        select: { spaceId: true },
        distinct: ['spaceId'],
      });

    let totalProcessed = 0;

    for (const mapping of spaceMappings) {
      const processed = await this.aggregateForSpace(
        tenantId,
        mapping.spaceId,
        fromDate,
        toDate,
      );
      totalProcessed += processed;
    }

    return totalProcessed;
  }

  private async aggregateForSpace(
    tenantId: string,
    spaceId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { timezone: true },
    });

    const timezone = space?.timezone || 'Europe/Paris';

    const locationMappings =
      await this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId, spaceId },
        select: { weezeventLocationId: true },
      });

    const locationIds = locationMappings.map((m) => m.weezeventLocationId);

    if (locationIds.length === 0) {
      this.logger.warn(`No location mappings found for space ${spaceId}`);
      return 0;
    }

    const transactions = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        weezeventEventId: string | null;
        weezeventLocationId: string | null;
        weezeventMerchantId: string | null;
        spaceElementId: string | null;
        revenueHt: Decimal;
        transactionsCount: bigint;
        itemsCount: bigint;
      }>
    >`
      SELECT 
        DATE(t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as day,
        t."eventId" as "weezeventEventId",
        t."locationId" as "weezeventLocationId",
        t."merchantId" as "weezeventMerchantId",
        mem."spaceElementId" as "spaceElementId",
        SUM(
          CASE 
            WHEN p."vatRate" IS NOT NULL THEN 
              ti."unitPrice" * ti.quantity / (1 + p."vatRate" / 100)
            ELSE 
              ti."unitPrice" * ti.quantity / 1.20
          END
        ) as "revenueHt",
        COUNT(DISTINCT t.id) as "transactionsCount",
        SUM(ti.quantity) as "itemsCount"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventProduct" p ON p.id = ti."productId"
      LEFT JOIN "WeezeventMerchantElementMapping" mem 
        ON mem."weezeventMerchantId" = t."merchantId" 
        AND mem."tenantId" = ${tenantId}
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t.status = 'completed'
      GROUP BY 
        day,
        t."eventId",
        t."locationId",
        t."merchantId",
        mem."spaceElementId"
    `;

    for (const agg of transactions) {
      await this.prisma.spaceRevenueDailyAgg.upsert({
        where: {
          tenantId_spaceId_day_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId:
            {
              tenantId,
              spaceId,
              day: agg.day,
              weezeventEventId: agg.weezeventEventId,
              weezeventLocationId: agg.weezeventLocationId,
              weezeventMerchantId: agg.weezeventMerchantId,
              spaceElementId: agg.spaceElementId,
            },
        },
        create: {
          tenantId,
          spaceId,
          day: agg.day,
          timezone,
          weezeventEventId: agg.weezeventEventId,
          weezeventLocationId: agg.weezeventLocationId,
          weezeventMerchantId: agg.weezeventMerchantId,
          spaceElementId: agg.spaceElementId,
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
        update: {
          revenueHt: agg.revenueHt,
          transactionsCount: Number(agg.transactionsCount),
          itemsCount: Number(agg.itemsCount),
        },
      });
    }

    await this.aggregateProducts(
      tenantId,
      spaceId,
      locationIds,
      fromDate,
      toDate,
      timezone,
    );

    await this.trackUnmappedData(tenantId, locationIds, fromDate, toDate);

    await this.incrementDashboardVersion(spaceId, tenantId);

    return transactions.length;
  }

  private async aggregateProducts(
    tenantId: string,
    spaceId: string,
    locationIds: string[],
    fromDate: Date,
    toDate: Date,
    timezone: string,
  ): Promise<void> {
    const productAggregates = await this.prisma.$queryRaw<
      Array<{
        day: Date;
        weezeventProductId: string;
        revenueHt: Decimal;
        quantity: bigint;
      }>
    >`
      SELECT 
        DATE(t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as day,
        ti."productId" as "weezeventProductId",
        SUM(
          CASE 
            WHEN p."vatRate" IS NOT NULL THEN 
              ti."unitPrice" * ti.quantity / (1 + p."vatRate" / 100)
            ELSE 
              ti."unitPrice" * ti.quantity / 1.20
          END
        ) as "revenueHt",
        SUM(ti.quantity) as quantity
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventProduct" p ON p.id = ti."productId"
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t.status = 'completed'
        AND ti."productId" IS NOT NULL
      GROUP BY day, ti."productId"
    `;

    for (const agg of productAggregates) {
      await this.prisma.spaceProductRevenueDailyAgg.upsert({
        where: {
          tenantId_spaceId_day_weezeventProductId: {
            tenantId,
            spaceId,
            day: agg.day,
            weezeventProductId: agg.weezeventProductId,
          },
        },
        create: {
          tenantId,
          spaceId,
          day: agg.day,
          weezeventProductId: agg.weezeventProductId,
          revenueHt: agg.revenueHt,
          quantity: Number(agg.quantity),
        },
        update: {
          revenueHt: agg.revenueHt,
          quantity: Number(agg.quantity),
        },
      });
    }
  }

  private async trackUnmappedData(
    tenantId: string,
    locationIds: string[],
    fromDate: Date,
    toDate: Date,
  ): Promise<void> {
    const unmappedMerchants = await this.prisma.$queryRaw<
      Array<{
        merchantId: string;
        merchantName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>
    >`
      SELECT 
        t."merchantId",
        t."merchantName",
        COUNT(DISTINCT t.id) as "transactionCount",
        SUM(t.amount) as "revenueHt"
      FROM "WeezeventTransaction" t
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."locationId" = ANY(${locationIds})
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t."merchantId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WeezeventMerchantElementMapping" mem
          WHERE mem."weezeventMerchantId" = t."merchantId"
          AND mem."tenantId" = ${tenantId}
        )
      GROUP BY t."merchantId", t."merchantName"
    `;

    for (const merchant of unmappedMerchants) {
      await this.prisma.unmappedDataMetrics.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId,
            entityType: 'merchant',
            entityId: merchant.merchantId,
          },
        },
        create: {
          tenantId,
          entityType: 'merchant',
          entityId: merchant.merchantId,
          entityName: merchant.merchantName || 'Unknown',
          transactionCount: Number(merchant.transactionCount),
          revenueHt: merchant.revenueHt,
        },
        update: {
          transactionCount: Number(merchant.transactionCount),
          revenueHt: merchant.revenueHt,
          lastSeenAt: new Date(),
        },
      });
    }

    const unmappedLocations = await this.prisma.$queryRaw<
      Array<{
        locationId: string;
        locationName: string;
        transactionCount: bigint;
        revenueHt: Decimal;
      }>
    >`
      SELECT 
        t."locationId",
        t."locationName",
        COUNT(DISTINCT t.id) as "transactionCount",
        SUM(t.amount) as "revenueHt"
      FROM "WeezeventTransaction" t
      WHERE 
        t."tenantId" = ${tenantId}
        AND t."transactionDate" >= ${fromDate}
        AND t."transactionDate" <= ${toDate}
        AND t."locationId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WeezeventLocationSpaceMapping" lsm
          WHERE lsm."weezeventLocationId" = t."locationId"
          AND lsm."tenantId" = ${tenantId}
        )
      GROUP BY t."locationId", t."locationName"
    `;

    for (const location of unmappedLocations) {
      await this.prisma.unmappedDataMetrics.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId,
            entityType: 'location',
            entityId: location.locationId,
          },
        },
        create: {
          tenantId,
          entityType: 'location',
          entityId: location.locationId,
          entityName: location.locationName || 'Unknown',
          transactionCount: Number(location.transactionCount),
          revenueHt: location.revenueHt,
        },
        update: {
          transactionCount: Number(location.transactionCount),
          revenueHt: location.revenueHt,
          lastSeenAt: new Date(),
        },
      });
    }
  }

  private async incrementDashboardVersion(
    spaceId: string,
    tenantId: string,
  ): Promise<void> {
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

  async getAggregationHealth(
    spaceId: string,
    tenantId: string,
  ): Promise<{
    lastAggregationAt: Date | null;
    dataFreshnessMinutes: number | null;
    missingMappingsCount: {
      locations: number;
      merchants: number;
      products: number;
    };
    aggregationStatus: 'healthy' | 'degraded' | 'error';
    lastError: string | null;
  }> {
    const lastJob = await this.prisma.aggregationJobLog.findFirst({
      where: {
        tenantId,
        spaceId,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
    });

    const lastFailedJob = await this.prisma.aggregationJobLog.findFirst({
      where: {
        tenantId,
        spaceId,
        status: 'failed',
      },
      orderBy: { completedAt: 'desc' },
    });

    const unmappedMetrics = await this.prisma.unmappedDataMetrics.groupBy({
      by: ['entityType'],
      where: { tenantId },
      _count: { id: true },
    });

    const missingMappingsCount = {
      locations:
        unmappedMetrics.find((m) => m.entityType === 'location')?._count.id ||
        0,
      merchants:
        unmappedMetrics.find((m) => m.entityType === 'merchant')?._count.id ||
        0,
      products:
        unmappedMetrics.find((m) => m.entityType === 'product')?._count.id || 0,
    };

    const dataFreshnessMinutes = lastJob?.completedAt
      ? Math.floor(
          (Date.now() - lastJob.completedAt.getTime()) / (1000 * 60),
        )
      : null;

    let aggregationStatus: 'healthy' | 'degraded' | 'error' = 'healthy';

    if (!lastJob) {
      aggregationStatus = 'error';
    } else if (dataFreshnessMinutes && dataFreshnessMinutes > 120) {
      aggregationStatus = 'degraded';
    } else if (
      lastFailedJob &&
      lastFailedJob.completedAt &&
      lastJob.completedAt &&
      lastFailedJob.completedAt > lastJob.completedAt
    ) {
      aggregationStatus = 'error';
    }

    return {
      lastAggregationAt: lastJob?.completedAt || null,
      dataFreshnessMinutes,
      missingMappingsCount,
      aggregationStatus,
      lastError: lastFailedJob?.error || null,
    };
  }
}
