import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

        // dataPoints = number of (minute × location) rows — same semantics as legacy KV array length
        const dataPoints = await this.prisma.spaceRevenueMinuteAgg.count({
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

    // Get unregistered dates + transaction stats — scoped to integrationId when provided.
    // Timezone: all date comparisons use Europe/Paris to correctly bucket night-time transactions.
    let unregisteredDates: any[] = [];
    let transactionStats: any = null;
    if (integrationId) {
      const [transactionDates, totalCount, matchedResult, unmappedLocsResult] = await Promise.all([
        // Dates with transactions but no DataFriday Event
        this.prisma.$queryRaw<any[]>`
          SELECT
            (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date as "date",
            COUNT(*)::int as "transactionCount",
            SUM(t."amount")::float as "revenue"
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            AND t."integrationId" = ${integrationId}
            AND (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date NOT IN (
              SELECT e."eventDate"::date FROM "Event" e
              WHERE e."tenantId" = ${tenantId} AND e."spaceId" = ${spaceId}
            )
          GROUP BY (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date
          ORDER BY (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date DESC
        `,
        // Total transaction count for this integration
        this.prisma.weezeventTransaction.count({ where: { tenantId, integrationId } }),
        // Transactions whose date matches a DataFriday Event (= will be aggregated)
        this.prisma.$queryRaw<[{ count: number }]>`
          SELECT COUNT(*)::int as count
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            AND t."integrationId" = ${integrationId}
            AND (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date IN (
              SELECT e."eventDate"::date FROM "Event" e
              WHERE e."tenantId" = ${tenantId} AND e."spaceId" = ${spaceId}
            )
        `,
        // Locations that have transactions but no WeezeventLocationShopMapping (excluded from aggregation)
        this.prisma.$queryRaw<any[]>`
          SELECT DISTINCT t."locationId"
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            AND t."integrationId" = ${integrationId}
            AND t."locationId" NOT IN (
              SELECT m."weezeventLocationId"
              FROM "WeezeventLocationShopMapping" m
              WHERE m."tenantId" = ${tenantId}
            )
        `,
      ]);
      unregisteredDates = transactionDates;
      const matched = (matchedResult as any[])[0]?.count ?? 0;
      transactionStats = {
        total: totalCount,
        matched,
        unmatched: totalCount - matched,
        unmappedLocationIds: (unmappedLocsResult as any[]).map((r) => r.locationId),
      };
    }

    return {
      events: eventsWithStatus,
      unregisteredDates,
      transactionStats,
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
   * Process events: aggregate transaction data per event.
   * Uses bulk SQL (DELETE + INSERT … SELECT … GROUP BY) instead of N×M individual queries.
   * Performance: < 5 s regardless of transaction volume (was 5–20 min with the row-by-row approach).
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[], integrationId?: string) {
    this.logger.log(`Processing events for space ${spaceId} [bulk SQL]`);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({ where, orderBy: { eventDate: 'asc' } });

    if (events.length === 0) {
      return { processed: 0, total: 0, results: [] };
    }

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

    try {
      // Validate integration mapping if provided
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

      const resolvedEventIds = events.map((e) => e.id);
      const integrationFilter = integrationId
        ? Prisma.sql`AND t."integrationId" = ${integrationId}`
        : Prisma.sql``;

      // ── 1. Clear existing SpaceRevenueDailyAgg for these events ──────────
      await this.prisma.$executeRaw`
        DELETE FROM "SpaceRevenueDailyAgg"
        WHERE "tenantId" = ${tenantId}
          AND "spaceId"  = ${spaceId}
          AND "weezeventEventId" = ANY(${resolvedEventIds}::text[])
      `;

      // ── 2. Bulk insert SpaceRevenueDailyAgg ──────────────────────────────
      // One query replaces N events × M shops individual upserts.
      // Joins Event by date, WeezeventLocationShopMapping for spaceElementId.
      await this.prisma.$executeRaw`
        INSERT INTO "SpaceRevenueDailyAgg" (
          id, "tenantId", "spaceId", day, timezone,
          "weezeventEventId", "weezeventLocationId", "weezeventMerchantId", "spaceElementId",
          "revenueHt", "transactionsCount", "itemsCount", "createdAt", "updatedAt"
        )
        SELECT
          gen_random_uuid()::text,
          ${tenantId},
          ${spaceId},
          DATE_TRUNC('day', e."eventDate")::date,
          'Europe/Paris',
          e.id,
          t."locationId",
          t."locationId",
          m."spaceElementId",
          SUM(t.amount),
          COUNT(t.id)::int,
          COALESCE(SUM(ic.cnt), 0)::int,
          NOW(),
          NOW()
        FROM "WeezeventTransaction" t
        JOIN "Event" e
          ON  e."tenantId" = ${tenantId}
          AND e."spaceId"  = ${spaceId}
          AND e.id         = ANY(${resolvedEventIds}::text[])
          AND (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date = e."eventDate"::date
        JOIN "WeezeventLocationShopMapping" m
          ON  m."tenantId"             = ${tenantId}
          AND m."weezeventLocationId"  = t."locationId"
        LEFT JOIN (
          SELECT "transactionId", COUNT(*)::int AS cnt
          FROM   "WeezeventTransactionItem"
          GROUP BY "transactionId"
        ) ic ON ic."transactionId" = t.id
        WHERE t."tenantId" = ${tenantId}
          ${integrationFilter}
        GROUP BY e.id, e."eventDate", t."locationId", m."spaceElementId"
      `;

      // ── 3. Clear existing SpaceProductRevenueDailyAgg for these event dates ─
      await this.prisma.$executeRaw`
        DELETE FROM "SpaceProductRevenueDailyAgg"
        WHERE "tenantId" = ${tenantId}
          AND "spaceId"  = ${spaceId}
          AND day IN (
            SELECT DATE_TRUNC('day', "eventDate")::date
            FROM   "Event"
            WHERE  id = ANY(${resolvedEventIds}::text[])
              AND  "tenantId" = ${tenantId}
              AND  "spaceId"  = ${spaceId}
          )
      `;

      // ── 4. Bulk insert SpaceProductRevenueDailyAgg ───────────────────────
      await this.prisma.$executeRaw`
        INSERT INTO "SpaceProductRevenueDailyAgg" (
          id, "tenantId", "spaceId", day,
          "weezeventProductId", "revenueHt", quantity, "createdAt", "updatedAt"
        )
        SELECT
          gen_random_uuid()::text,
          ${tenantId},
          ${spaceId},
          DATE_TRUNC('day', e."eventDate")::date,
          i."productId",
          SUM(i."unitPrice" * i.quantity - COALESCE(i.reduction, 0)),
          SUM(i.quantity)::int,
          NOW(),
          NOW()
        FROM "WeezeventTransactionItem" i
        JOIN "WeezeventTransaction" t ON t.id = i."transactionId"
        JOIN "Event" e
          ON  e."tenantId" = ${tenantId}
          AND e."spaceId"  = ${spaceId}
          AND e.id         = ANY(${resolvedEventIds}::text[])
          AND (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date = e."eventDate"::date
        WHERE t."tenantId"   = ${tenantId}
          ${integrationFilter}
          AND i."productId" IS NOT NULL
        GROUP BY DATE_TRUNC('day', e."eventDate"), i."productId"
      `;

      // ── 5. Clear existing SpaceRevenueMinuteAgg for these events ─────────
      await this.prisma.$executeRaw`
        DELETE FROM "SpaceRevenueMinuteAgg"
        WHERE "tenantId" = ${tenantId}
          AND "spaceId"  = ${spaceId}
          AND "weezeventEventId" = ANY(${resolvedEventIds}::text[])
      `;

      // ── 6. Bulk insert SpaceRevenueMinuteAgg ─────────────────────────────
      // One row per (event × location × minute), replacing the old KV "event-timeline" array.
      // dataPoints = COUNT(DISTINCT minute) — same semantics as the legacy system.
      await this.prisma.$executeRaw`
        INSERT INTO "SpaceRevenueMinuteAgg" (
          id, "tenantId", "spaceId", minute, timezone,
          "weezeventEventId", "weezeventLocationId", "spaceElementId",
          "revenueHt", "transactionsCount", "itemsCount", "createdAt", "updatedAt"
        )
        SELECT
          gen_random_uuid()::text,
          ${tenantId},
          ${spaceId},
          DATE_TRUNC('minute', t."transactionDate"),
          'Europe/Paris',
          e.id,
          t."locationId",
          m."spaceElementId",
          SUM(t.amount),
          COUNT(t.id)::int,
          COALESCE(SUM(ic.cnt), 0)::int,
          NOW(),
          NOW()
        FROM "WeezeventTransaction" t
        JOIN "Event" e
          ON  e."tenantId" = ${tenantId}
          AND e."spaceId"  = ${spaceId}
          AND e.id         = ANY(${resolvedEventIds}::text[])
          AND (t."transactionDate" AT TIME ZONE 'Europe/Paris')::date = e."eventDate"::date
        JOIN "WeezeventLocationShopMapping" m
          ON  m."tenantId"            = ${tenantId}
          AND m."weezeventLocationId" = t."locationId"
        LEFT JOIN (
          SELECT "transactionId", COUNT(*)::int AS cnt
          FROM   "WeezeventTransactionItem"
          GROUP BY "transactionId"
        ) ic ON ic."transactionId" = t.id
        WHERE t."tenantId" = ${tenantId}
          ${integrationFilter}
        GROUP BY e.id, t."locationId", m."spaceElementId", DATE_TRUNC('minute', t."transactionDate")
      `;

      // Count actual transactions aggregated (sum of transactionsCount written to SpaceRevenueDailyAgg)
      const [txCountRow] = await this.prisma.$queryRaw<[{ count: number }]>`
        SELECT COALESCE(SUM("transactionsCount"), 0)::int as count
        FROM "SpaceRevenueDailyAgg"
        WHERE "tenantId" = ${tenantId}
          AND "spaceId"  = ${spaceId}
          AND "weezeventEventId" = ANY(${resolvedEventIds}::text[])
      `;
      const actualTxCount = (txCountRow as any)?.count ?? events.length;

      await this.prisma.aggregationJobLog.update({
        where: { id: job.id },
        data: { status: 'completed', completedAt: new Date(), transactionsProcessed: actualTxCount },
      });

      return {
        jobId: job.id,
        processed: actualTxCount,
        total: actualTxCount,
        results: events.map((e) => ({ eventId: e.id, eventName: e.name, date: e.eventDate, status: 'success' })),
      };
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: job.id },
        data: { status: 'failed', error: err.message, completedAt: new Date() },
      });
      throw err;
    }
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
    await this.prisma.spaceRevenueMinuteAgg.deleteMany({
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

  /**
   * Breakdown by shop and product for a given DataFriday event
   */
  async getEventBreakdown(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    // Shops breakdown — one row per mapped shop (spaceElement)
    const shopRows = await this.prisma.spaceRevenueDailyAgg.findMany({
      where: { tenantId, spaceId, weezeventEventId: eventId },
      orderBy: { revenueHt: 'desc' },
    });

    // Resolve spaceElement names
    const elementIds = [...new Set(shopRows.map(r => r.spaceElementId).filter(Boolean))] as string[];
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({ where: { id: { in: elementIds } }, select: { id: true, name: true } })
      : [];
    const elementNameById = new Map(elements.map(e => [e.id, e.name]));

    const shops = shopRows.map(r => ({
      shopId: r.spaceElementId,
      shopName: elementNameById.get(r.spaceElementId!) || r.weezeventLocationId || 'Inconnu',
      revenueHt: Number(r.revenueHt),
      transactionsCount: r.transactionsCount,
      itemsCount: r.itemsCount,
    }));

    // Products breakdown — filtered by event date
    const eventDay = new Date(event.eventDate);
    eventDay.setHours(0, 0, 0, 0);
    const nextDay = new Date(eventDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const productRows = await this.prisma.spaceProductRevenueDailyAgg.findMany({
      where: { tenantId, spaceId, day: { gte: eventDay, lt: nextDay } },
      orderBy: { revenueHt: 'desc' },
    });

    const productIds = productRows.map(r => r.weezeventProductId);
    const products = productIds.length
      ? await this.prisma.weezeventProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
      : [];
    const productNameById = new Map(products.map(p => [p.id, p.name]));

    const items = productRows.map(r => ({
      productId: r.weezeventProductId,
      productName: productNameById.get(r.weezeventProductId) || 'Inconnu',
      revenueHt: Number(r.revenueHt),
      quantity: r.quantity,
    }));

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      totals: {
        revenueHt: shops.reduce((s, r) => s + r.revenueHt, 0),
        transactionsCount: shops.reduce((s, r) => s + (r.transactionsCount || 0), 0),
        itemsCount: shops.reduce((s, r) => s + (r.itemsCount || 0), 0),
        shopCount: shops.length,
        productCount: items.length,
      },
      shops,
      items,
    };
  }

  /**
   * Event statistics queried directly from raw WeezeventTransaction rows.
   * No pre-aggregation needed — one SQL GROUP BY query per request.
   * groupBy: 'minute' | 'hour' | 'shop' | 'product'
   */
  async getEventStats(tenantId: string, spaceId: string, eventId: string, groupBy: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId, spaceId } });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const startDate = new Date(event.eventDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    // Step 1 of the wizard stores integrationId as weezeventLocationId in this mapping table
    const spaceMapping = await this.prisma.weezeventLocationSpaceMapping.findFirst({
      where: { tenantId, spaceId },
    });
    const integrationId = spaceMapping?.weezeventLocationId;
    const integrationFilter = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.sql``;
    const integrationFilterFlat = integrationId
      ? Prisma.sql`AND "integrationId" = ${integrationId}`
      : Prisma.sql``;

    if (groupBy === 'minute' || groupBy === 'hour') {
      const unit = groupBy;
      const rows = await this.prisma.$queryRaw<{ bucket: Date; revenue: number; transactions: number }[]>`
        SELECT
          DATE_TRUNC(${unit}, "transactionDate") AS bucket,
          SUM(amount)::float                      AS revenue,
          COUNT(*)::int                           AS transactions
        FROM "WeezeventTransaction"
        WHERE "tenantId" = ${tenantId}
          ${integrationFilterFlat}
          AND "transactionDate" >= ${startDate}
          AND "transactionDate" < ${endDate}
        GROUP BY 1
        ORDER BY 1
      `;
      return { eventId, eventName: event.name, eventDate: event.eventDate, groupBy, data: rows };
    }

    if (groupBy === 'shop') {
      const shopRows = await this.prisma.$queryRaw<{ locationId: string; locationName: string; revenue: number; transactions: number; items: number }[]>`
        SELECT
          t."locationId",
          l."name"                                  AS "locationName",
          SUM(t.amount)::float                      AS revenue,
          COUNT(t.id)::int                          AS transactions,
          COALESCE(SUM(ic.cnt), 0)::int             AS items
        FROM "WeezeventTransaction" t
        LEFT JOIN "WeezeventLocation" l ON l.id = t."locationId"
        LEFT JOIN (
          SELECT "transactionId", COUNT(*)::int AS cnt
          FROM "WeezeventTransactionItem"
          GROUP BY "transactionId"
        ) ic ON ic."transactionId" = t.id
        WHERE t."tenantId" = ${tenantId}
          ${integrationFilter}
          AND t."transactionDate" >= ${startDate}
          AND t."transactionDate" < ${endDate}
        GROUP BY t."locationId", l."name"
        ORDER BY revenue DESC
      `;

      // Resolve SpaceElement friendly names from wizard step 2 mapping
      const locationIds = shopRows.map((r) => r.locationId).filter(Boolean);
      const shopMappings = locationIds.length
        ? await this.prisma.weezeventLocationShopMapping.findMany({
            where: { tenantId, weezeventLocationId: { in: locationIds } },
          })
        : [];
      const elementIds = shopMappings.map((m) => m.spaceElementId);
      const elements = elementIds.length
        ? await this.prisma.spaceElement.findMany({
            where: { id: { in: elementIds } },
            select: { id: true, name: true },
          })
        : [];
      const elementNameByLocationId = new Map(
        shopMappings.map((m) => [m.weezeventLocationId, elements.find((e) => e.id === m.spaceElementId)?.name ?? null]),
      );

      const data = shopRows.map((r) => ({
        shopId: r.locationId,
        shopName: elementNameByLocationId.get(r.locationId) ?? r.locationName ?? r.locationId ?? 'Inconnu',
        revenue: r.revenue,
        transactions: r.transactions,
        items: r.items,
      }));

      return { eventId, eventName: event.name, eventDate: event.eventDate, groupBy, data };
    }

    if (groupBy === 'product') {
      const productRows = await this.prisma.$queryRaw<{ productId: string; productName: string; revenue: number; quantity: number }[]>`
        SELECT
          i."productId",
          i."productName",
          SUM(i."unitPrice" * i.quantity - COALESCE(i.reduction, 0))::float AS revenue,
          SUM(i.quantity)::int                                               AS quantity
        FROM "WeezeventTransactionItem" i
        JOIN "WeezeventTransaction" t ON t.id = i."transactionId"
        WHERE t."tenantId" = ${tenantId}
          ${integrationFilter}
          AND t."transactionDate" >= ${startDate}
          AND t."transactionDate" < ${endDate}
          AND i."productId" IS NOT NULL
        GROUP BY i."productId", i."productName"
        ORDER BY revenue DESC
      `;

      const data = productRows.map((r) => ({
        productId: r.productId,
        productName: r.productName || 'Inconnu',
        revenue: r.revenue,
        quantity: r.quantity,
      }));

      return { eventId, eventName: event.name, eventDate: event.eventDate, groupBy, data };
    }

    throw new BadRequestException(`groupBy must be one of: minute, hour, shop, product`);
  }

  /**
   * Minute-level CA chart from pre-aggregated SpaceRevenueMinuteAgg.
   * Aggregates across all locations → one row per active minute.
   * Use this for the "Timeline" chart on the event page.
   */
  async getEventMinuteChart(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId, spaceId } });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const rows = await this.prisma.$queryRaw<{ minute: Date; revenueHt: number; transactionsCount: number; shopCount: number }[]>`
      SELECT
        minute,
        SUM("revenueHt")::float           AS "revenueHt",
        SUM("transactionsCount")::int      AS "transactionsCount",
        COUNT(DISTINCT "weezeventLocationId")::int AS "shopCount"
      FROM "SpaceRevenueMinuteAgg"
      WHERE "tenantId"         = ${tenantId}
        AND "spaceId"          = ${spaceId}
        AND "weezeventEventId" = ${eventId}
      GROUP BY minute
      ORDER BY minute ASC
    `;

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      data: rows.map(r => ({
        minute:           r.minute.toISOString().substring(11, 16), // 'HH:MM'
        revenueHt:        Number(r.revenueHt),
        transactionsCount: Number(r.transactionsCount),
        shopCount:        Number(r.shopCount),
      })),
    };
  }
}
