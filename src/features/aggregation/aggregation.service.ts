import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get events with their processing status for a space
   */
  async getEventsTimelineStatus(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Getting events timeline status for space ${spaceId}`);

    // Verify space exists
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
    });
    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    // Get past events only — future events have no sales data yet
    const events = await this.prisma.event.findMany({
      where: { tenantId, spaceId, eventDate: { lte: new Date() } },
      orderBy: { eventDate: 'desc' },
    });

    const futureEventsCount = await this.prisma.event.count({
      where: { tenantId, spaceId, eventDate: { gt: new Date() } },
    });

    // Get aggregation job logs for each event
    const eventsWithStatus = await Promise.all(
      events.map(async (event) => {
        const job = await this.prisma.aggregationJobLog.findFirst({
          where: {
            tenantId,
            spaceId,
            // metadata.eventIds is an array — use array_contains
            metadata: { path: ['eventIds'], array_contains: event.id },
          },
          orderBy: { startedAt: 'desc' },
        });

        const dataPoints = await this.prisma.spaceRevenueDailyAgg.count({
          where: { tenantId, spaceId, weezeventEventId: event.id },
        });

        return {
          ...event,
          aggregationStatus: job?.status || 'pending',
          lastProcessedAt: job?.completedAt || null,
          transactionsProcessed: job?.transactionsProcessed || 0,
          dataPoints,
        };
      }),
    );

    // Get unregistered dates — transactions that exist but have no matching Event configured.
    // Step 1 saves integrationId as weezeventLocationId, so we look it up directly.
    // Then we resolve the actual WeezeventLocation.ids to filter transactions.
    let integrationLocationIds: string[] = [];
    if (integrationId) {
      const locations = await this.prisma.weezeventLocation.findMany({
        where: { tenantId, integrationId },
        select: { id: true },
      });
      integrationLocationIds = locations.map((l) => l.id);
    }

    let unregisteredDates: any[] = [];
    if (integrationId && integrationLocationIds.length > 0) {
      const locationIdsFilter = Prisma.sql`AND t."locationId" = ANY(ARRAY[${Prisma.join(integrationLocationIds)}]::text[])`;
      const integrationFilter = Prisma.sql`AND t."integrationId" = ${integrationId}`;
      const transactionDates = await this.prisma.$queryRaw<any[]>`
        SELECT 
          DATE(t."transactionDate") as "date",
          COUNT(*)::int as "transactionCount",
          SUM(t."amount")::float as "revenue"
        FROM "WeezeventTransaction" t
        WHERE t."tenantId" = ${tenantId}
          ${integrationFilter}
          ${locationIdsFilter}
          AND DATE(t."transactionDate") NOT IN (
            SELECT DATE(e."eventDate") FROM "Event" e WHERE e."tenantId" = ${tenantId} AND e."spaceId" = ${spaceId}
          )
        GROUP BY DATE(t."transactionDate")
        ORDER BY DATE(t."transactionDate") DESC
      `;
      unregisteredDates = transactionDates;
    }

    return {
      events: eventsWithStatus,
      unregisteredDates,
      futureEventsCount,
      summary: {
        total: events.length,
        processed: eventsWithStatus.filter((e) => e.aggregationStatus === 'completed').length,
        skipped: eventsWithStatus.filter((e) => e.aggregationStatus === 'skipped').length,
        pending: eventsWithStatus.filter((e) => e.aggregationStatus === 'pending').length,
        failed: eventsWithStatus.filter((e) => e.aggregationStatus === 'failed').length,
      },
    };
  }

  /**
   * Process events: aggregate transaction data per event
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[], integrationId?: string) {
    this.logger.log(`Processing events for space ${spaceId}`);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) {
      where.id = { in: eventIds };
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    if (events.length === 0) {
      return { processed: 0, total: 0, results: [] };
    }

    // Create a job log
    const job = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: eventIds?.length ? 'incremental' : 'full',
        status: 'running',
        fromDate: events[0].eventDate,
        toDate: events[events.length - 1].eventDate,
        metadata: { eventIds: eventIds || events.map((e) => e.id) },
      },
    });

    const results: any[] = [];
    let processedCount = 0;

    try {
      // Step 1 of the wizard saves `integration.id` as `weezeventLocationId` in
      // WeezeventLocationSpaceMapping. We verify the integration is mapped to this space.
      if (integrationId) {
        const spaceLink = await this.prisma.weezeventLocationSpaceMapping.findFirst({
          where: { tenantId, weezeventLocationId: integrationId },
        });
        if (!spaceLink) {
          throw new Error(`Integration ${integrationId} is not mapped to any space. Complete step 1 of the wizard.`);
        }
        if (spaceLink.spaceId !== spaceId) {
          throw new Error(`Integration ${integrationId} is mapped to a different space (${spaceLink.spaceId}).`);
        }
      }

      // Get the real WeezeventLocation DB ids for this integration.
      // Step 2 of the wizard saves these as weezeventMerchantId in WeezeventMerchantElementMapping.
      const integrationLocations = integrationId
        ? await this.prisma.weezeventLocation.findMany({
            where: { tenantId, integrationId },
            select: { id: true },
          })
        : [];
      const locationIds = integrationLocations.map((l) => l.id);

      if (integrationId && locationIds.length === 0) {
        throw new Error(`No Weezevent locations found for integration ${integrationId}. Sync locations first.`);
      }

      for (const event of events) {
        try {
          const eventDate = new Date(event.eventDate);
          const nextDay = new Date(eventDate);
          nextDay.setDate(nextDay.getDate() + 1);

          // Get transactions scoped to this integration's locations.
          // Group by locationId (point de vente), NOT by merchantId:
          //   - Step 2 maps WeezeventLocation → SpaceElement (weezeventMerchantId = location.id)
          //   - We therefore need to group revenue by the location, not by the merchant/standiste.
          const transactions = await this.prisma.weezeventTransaction.findMany({
            where: {
              tenantId,
              ...(integrationId ? { integrationId } : {}),
              ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
              transactionDate: {
                gte: eventDate,
                lt: nextDay,
              },
            },
            include: { items: true },
          });

          // Aggregate revenue by locationId (point de vente physique)
          const locationRevenue = new Map<string, { revenue: number; count: number; items: number }>();
          for (const tx of transactions) {
            if (!tx.locationId) continue; // skip transactions with no location
            const current = locationRevenue.get(tx.locationId) || { revenue: 0, count: 0, items: 0 };
            current.revenue += Number(tx.amount || 0);
            current.count += 1;
            current.items += tx.items?.length || 0;
            locationRevenue.set(tx.locationId, current);
          }

          const unmappedLocationIds: string[] = [];

          // Upsert daily aggregation records, one row per mapped location
          for (const [locationId, data] of locationRevenue) {
            // Step 2 wizard saves: WeezeventMerchantElementMapping.weezeventMerchantId = WeezeventLocation.id
            // So we look up the SpaceElement by the location id.
            const elementMapping = await this.prisma.weezeventMerchantElementMapping.findFirst({
              where: { tenantId, weezeventMerchantId: locationId },
            });

            if (!elementMapping) {
              // No mapping configured in step 2 — skip silently would hide data.
              // Record it so the caller can surface it to the user.
              unmappedLocationIds.push(locationId);
              continue;
            }

            await this.prisma.spaceRevenueDailyAgg.upsert({
              where: {
                tenantId_spaceId_day_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId: {
                  tenantId,
                  spaceId,
                  day: eventDate,
                  weezeventEventId: event.id,
                  weezeventLocationId: locationId,
                  weezeventMerchantId: locationId, // same id: location acts as the shop grouping dimension
                  spaceElementId: elementMapping.spaceElementId,
                },
              },
              create: {
                tenantId,
                spaceId,
                day: eventDate,
                weezeventEventId: event.id,
                weezeventLocationId: locationId,
                weezeventMerchantId: locationId,
                spaceElementId: elementMapping.spaceElementId,
                revenueHt: data.revenue,
                transactionsCount: data.count,
                itemsCount: data.items,
              },
              update: {
                revenueHt: data.revenue,
                transactionsCount: data.count,
                itemsCount: data.items,
              },
            });
          }

          // Aggregate product revenue into SpaceProductRevenueDailyAgg
          // Revenue per item = unitPrice * quantity - reduction
          const productRevenue = new Map<string, { revenue: number; quantity: number }>();
          for (const tx of transactions) {
            for (const item of tx.items || []) {
              if (!item.productId) continue;
              const current = productRevenue.get(item.productId) || { revenue: 0, quantity: 0 };
              const itemRevenue = Number(item.unitPrice) * item.quantity - Number(item.reduction || 0);
              current.revenue += itemRevenue;
              current.quantity += item.quantity;
              productRevenue.set(item.productId, current);
            }
          }

          for (const [productId, data] of productRevenue) {
            await this.prisma.spaceProductRevenueDailyAgg.upsert({
              where: {
                tenantId_spaceId_day_weezeventProductId: {
                  tenantId,
                  spaceId,
                  day: eventDate,
                  weezeventProductId: productId,
                },
              },
              create: {
                tenantId,
                spaceId,
                day: eventDate,
                weezeventProductId: productId,
                revenueHt: data.revenue,
                quantity: data.quantity,
              },
              update: {
                revenueHt: data.revenue,
                quantity: data.quantity,
              },
            });
          }

          processedCount++;
          results.push({
            eventId: event.id,
            eventName: event.name,
            date: event.eventDate,
            transactions: transactions.length,
            revenue: Array.from(locationRevenue.values()).reduce((s, v) => s + v.revenue, 0),
            unmappedLocations: unmappedLocationIds,
            status: 'success',
          });
        } catch (err) {
          results.push({
            eventId: event.id,
            eventName: event.name,
            status: 'error',
            error: err.message,
          });
        }
      }

      // Update job log
      await this.prisma.aggregationJobLog.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          transactionsProcessed: processedCount,
        },
      });
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: err.message,
          completedAt: new Date(),
        },
      });
      throw err;
    }

    return {
      jobId: job.id,
      processed: processedCount,
      total: events.length,
      results,
    };
  }

  /**
   * Synchronize: cleanup + rebuild all aggregation data for a space
   */
  async synchronize(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Synchronizing aggregated data for space ${spaceId}`);

    // Phase 1: Cleanup old data
    await this.prisma.spaceRevenueDailyAgg.deleteMany({
      where: { tenantId, spaceId },
    });

    // Phase 2: Process all events
    const result = await this.processEvents(tenantId, spaceId, undefined, integrationId);

    // Phase 3: Compute space summary metrics
    const summary = await this.prisma.spaceRevenueDailyAgg.aggregate({
      where: { tenantId, spaceId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: true,
    });

    return {
      ...result,
      summary: {
        totalRevenue: Number(summary._sum.revenueHt || 0),
        totalTransactions: summary._sum.transactionsCount || 0,
        totalItems: summary._sum.itemsCount || 0,
        aggregationRecords: summary._count,
      },
    };
  }

  /**
   * Get aggregation job progress — rich response for real-time progress indicator
   */
  async getJobProgress(tenantId: string, jobId: string) {
    const job = await this.prisma.aggregationJobLog.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const eventIds: string[] = (job.metadata as any)?.eventIds || [];
    const total = eventIds.length || 1;
    const current = job.transactionsProcessed || 0;

    const percentage =
      job.status === 'completed' ? 100
      : job.status === 'failed' || job.status === 'skipped' ? 0
      : Math.min(Math.round((current / total) * 100), 99);

    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    const rowsPerSecond = elapsedMs > 0 && current > 0 ? Math.round((current / elapsedMs) * 1000) : 0;
    const estimatedTimeRemaining =
      rowsPerSecond > 0 && current < total
        ? Math.ceil((total - current) / rowsPerSecond)
        : null;

    const phase =
      job.status === 'completed' ? 'Done'
      : job.status === 'failed' ? 'Failed'
      : job.status === 'skipped' ? 'Skipped'
      : current === 0 ? 'Initializing...'
      : current >= total ? 'Finalizing...'
      : 'Processing transactions...';

    // Count aggregated data points written so far
    const aggregatedPoints = job.spaceId
      ? await this.prisma.spaceRevenueDailyAgg.count({
          where: {
            tenantId,
            spaceId: job.spaceId,
            weezeventEventId: { in: eventIds.length ? eventIds : undefined },
          },
        })
      : 0;

    return {
      jobId: job.id,
      status: job.status,
      phase,
      percentage,
      current,
      total,
      rowsPerSecond,
      aggregatedPoints,
      estimatedTimeRemaining,
      error: job.error || null,
      completedAt: job.completedAt,
    };
  }

  /**
   * Mark an event as skipped \u2014 no sales data available or deliberately excluded
   */
  async skipEvent(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: 'skip',
        status: 'skipped',
        fromDate: event.eventDate,
        toDate: event.eventDate,
        metadata: { eventIds: [eventId] },
      },
    });

    this.logger.log(`Event ${eventId} marked as skipped for space ${spaceId}`);
    return { eventId, status: 'skipped' };
  }
}
