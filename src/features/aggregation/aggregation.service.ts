import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get events with their processing status for a space
   */
  async getEventsTimelineStatus(tenantId: string, spaceId: string) {
    this.logger.log(`Getting events timeline status for space ${spaceId}`);

    // Verify space exists
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
    });
    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    // Get events linked to this space
    const events = await this.prisma.event.findMany({
      where: { tenantId, spaceId },
      orderBy: { eventDate: 'desc' },
    });

    // Get aggregation job logs for each event
    const eventsWithStatus = await Promise.all(
      events.map(async (event) => {
        const job = await this.prisma.aggregationJobLog.findFirst({
          where: {
            tenantId,
            spaceId,
            metadata: { path: ['eventId'], equals: event.id },
          },
          orderBy: { startedAt: 'desc' },
        });

        return {
          ...event,
          aggregationStatus: job?.status || 'pending',
          lastProcessedAt: job?.completedAt || null,
          transactionsProcessed: job?.transactionsProcessed || 0,
        };
      }),
    );

    // Get unregistered dates (dates with weezevent transactions but no event)
    const locationMapping = await this.prisma.weezeventLocationSpaceMapping.findFirst({
      where: { tenantId, spaceId },
    });

    let unregisteredDates: any[] = [];
    if (locationMapping) {
      const transactionDates = await this.prisma.$queryRaw<any[]>`
        SELECT 
          DATE(t."transactionDate") as "date",
          COUNT(*)::int as "transactionCount",
          SUM(t."amount")::float as "revenue"
        FROM "WeezeventTransaction" t
        WHERE t."tenantId" = ${tenantId}
          AND t."locationId" = ${locationMapping.weezeventLocationId}
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
      summary: {
        total: events.length,
        processed: eventsWithStatus.filter((e) => e.aggregationStatus === 'completed').length,
        pending: eventsWithStatus.filter((e) => e.aggregationStatus === 'pending').length,
        failed: eventsWithStatus.filter((e) => e.aggregationStatus === 'failed').length,
      },
    };
  }

  /**
   * Process events: aggregate transaction data per event
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[]) {
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
      // Get location mapping to find weezevent data
      const locationMapping = await this.prisma.weezeventLocationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
      });

      if (!locationMapping) {
        throw new Error('No location mapped to this space');
      }

      for (const event of events) {
        try {
          const eventDate = new Date(event.eventDate);
          const nextDay = new Date(eventDate);
          nextDay.setDate(nextDay.getDate() + 1);

          // Get transactions for this event date
          const transactions = await this.prisma.weezeventTransaction.findMany({
            where: {
              tenantId,
              locationId: locationMapping.weezeventLocationId,
              transactionDate: {
                gte: eventDate,
                lt: nextDay,
              },
            },
            include: { items: true },
          });

          // Aggregate revenue by merchant
          const merchantRevenue = new Map<string, { revenue: number; count: number; items: number }>();

          for (const tx of transactions) {
            const merchantId = tx.merchantId || 'unknown';
            const current = merchantRevenue.get(merchantId) || { revenue: 0, count: 0, items: 0 };
            current.revenue += Number(tx.amount || 0);
            current.count += 1;
            current.items += tx.items?.length || 0;
            merchantRevenue.set(merchantId, current);
          }

          // Upsert daily aggregation records
          for (const [merchantId, data] of merchantRevenue) {
            // Find the element mapping for this merchant
            const elementMapping = await this.prisma.weezeventMerchantElementMapping.findFirst({
              where: { tenantId, weezeventMerchantId: merchantId },
            });

            await this.prisma.spaceRevenueDailyAgg.upsert({
              where: {
                tenantId_spaceId_day_weezeventEventId_weezeventLocationId_weezeventMerchantId_spaceElementId: {
                  tenantId,
                  spaceId,
                  day: eventDate,
                  weezeventEventId: event.id,
                  weezeventLocationId: locationMapping.weezeventLocationId,
                  weezeventMerchantId: merchantId,
                  spaceElementId: elementMapping?.spaceElementId || '',
                },
              },
              create: {
                tenantId,
                spaceId,
                day: eventDate,
                weezeventEventId: event.id,
                weezeventLocationId: locationMapping.weezeventLocationId,
                weezeventMerchantId: merchantId,
                spaceElementId: elementMapping?.spaceElementId || '',
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

          processedCount++;
          results.push({
            eventId: event.id,
            eventName: event.name,
            date: event.eventDate,
            transactions: transactions.length,
            revenue: Array.from(merchantRevenue.values()).reduce((s, v) => s + v.revenue, 0),
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
  async synchronize(tenantId: string, spaceId: string) {
    this.logger.log(`Synchronizing aggregated data for space ${spaceId}`);

    // Phase 1: Cleanup old data
    await this.prisma.spaceRevenueDailyAgg.deleteMany({
      where: { tenantId, spaceId },
    });

    // Phase 2: Process all events
    const result = await this.processEvents(tenantId, spaceId);

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
   * Get aggregation job progress
   */
  async getJobProgress(tenantId: string, jobId: string) {
    const job = await this.prisma.aggregationJobLog.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }
}
