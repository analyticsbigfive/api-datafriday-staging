import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService, AggregationJobEnqueueData } from '../../core/queue/queue.service';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

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

    // Pré-charge tous les jobs du space en batch (évite N findFirst)
    const allJobs = await this.prisma.aggregationJobLog.findMany({
      where: { tenantId, spaceId },
      orderBy: { startedAt: 'desc' },
    });

    // Pré-charge le COUNT des lignes d'agrégation par event (= nb combinaisons minute×shop×item, aligné sur l'ancien code)
    const dataPointGroups = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['weezeventEventId'],
      where: { tenantId, spaceId },
      _count: { _all: true },
    });
    const dataPointsByEvent = new Map(
      dataPointGroups.map((g) => [g.weezeventEventId, Number(g._count._all ?? 0)]),
    );

    // Index : event.id → dernier job (allJobs déjà triés desc par startedAt)
    const latestJobByEvent = new Map<string, (typeof allJobs)[0]>();
    for (const job of allJobs) {
      const eventIds: string[] = (job.metadata as any)?.eventIds || [];
      for (const eid of eventIds) {
        if (!latestJobByEvent.has(eid)) {
          latestJobByEvent.set(eid, job);
        }
      }
    }

    const eventsWithStatus = events.map((event) => {
      const job = latestJobByEvent.get(event.id);
      return {
        ...event,
        aggregationStatus: job?.status || 'pending',
        lastProcessedAt: job?.completedAt || null,
        transactionsProcessed: job?.transactionsProcessed || 0,
        dataPoints: dataPointsByEvent.get(event.id) ?? 0,
      };
    });

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

    // #5 — transactionStats : total / matched / unmatched / unmappedLocationIds
    let transactionStats: {
      total: number;
      matched: number;
      unmatched: number;
      unmappedLocationIds: string[];
    } | null = null;

    if (integrationId && integrationLocationIds.length > 0) {
      const locationIdsFilter = Prisma.sql`AND t."locationId" = ANY(ARRAY[${Prisma.join(integrationLocationIds)}]::text[])`;
      const integrationFilter = Prisma.sql`AND t."integrationId" = ${integrationId}`;
      const eventDates = events.map((e) => new Date(e.eventDate).toISOString().slice(0, 10));

      const [totalRow, unmappedRows] = await Promise.all([
        eventDates.length > 0
          ? this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>`
              SELECT
                COUNT(*)::bigint as total,
                COUNT(*) FILTER (
                  WHERE DATE(t."transactionDate") = ANY(ARRAY[${Prisma.join(eventDates)}]::date[])
                )::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
                ${locationIdsFilter}
            `
          : this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>`
              SELECT
                COUNT(*)::bigint as total,
                0::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
                ${locationIdsFilter}
            `,
        // Locations avec transactions mais sans shop mapping
        this.prisma.$queryRaw<Array<{ locationId: string }>>`
          SELECT DISTINCT t."locationId"
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            ${integrationFilter}
            ${locationIdsFilter}
            AND t."locationId" IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "WeezeventLocationShopMapping" m
              WHERE m."tenantId" = ${tenantId}
                AND m."weezeventLocationId" = t."locationId"
            )
        `,
      ]);

      const total = Number(totalRow[0]?.total ?? 0);
      const matched = Number(totalRow[0]?.matched ?? 0);
      transactionStats = {
        total,
        matched,
        unmatched: total - matched,
        unmappedLocationIds: unmappedRows.map((r) => r.locationId),
      };
    }

    return {
      events: eventsWithStatus,
      unregisteredDates,
      futureEventsCount,
      transactionStats,
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
   * Version BullMQ — crée le job log (pending) et enqueue. Retourne immédiatement.
   * Le traitement réel est effectué par AggregationProcessor → executeProcessEvents().
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[], integrationId?: string) {
    this.logger.log(`Queueing process-events for space ${spaceId}`);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    if (events.length === 0) {
      return { processed: 0, total: 0, results: [] };
    }

    const allEventIds = eventIds || events.map((e) => e.id);

    // Pré-création du job log — ID stable pour getJobProgress pendant l'exécution async
    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: eventIds?.length ? 'incremental' : 'full',
        status: 'pending',
        fromDate: events[0].eventDate,
        toDate: events[events.length - 1].eventDate,
        metadata: { eventIds: allEventIds },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'process-events',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      eventIds: allEventIds,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued', total: events.length };
  }

  /**
   * Logique d'exécution réelle — appelée par AggregationProcessor.
   * Met à jour AggregationJobLog en DB + progression BullMQ au fil du traitement.
   */
  async executeProcessEvents(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, eventIds, integrationId, jobLogId } = job.data;
    this.logger.log(`Executing process-events for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await job.updateProgress(0);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
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
          // #8 — événements multi-jours : utiliser eventEndDate si disponible
          const baseEndDate = event.eventEndDate ? new Date(event.eventEndDate) : new Date(eventDate);
          const nextDay = new Date(baseEndDate);
          nextDay.setDate(nextDay.getDate() + 1);

          // Efface les anciennes lignes de cet event avant re-agrégation
          await this.prisma.spaceRevenueMinuteAgg.deleteMany({
            where: { tenantId, spaceId, weezeventEventId: event.id },
          });

          // Filtres dynamiques (SQL fragments composables)
          const integrationClause = integrationId
            ? Prisma.sql`AND t."integrationId" = ${integrationId}`
            : Prisma.sql``;
          const locationClause = locationIds.length > 0
            ? Prisma.sql`AND t."locationId" IN (${Prisma.join(locationIds)})`
            : Prisma.sql``;

          // Agrégation DB-level : JOIN + GROUP BY + INSERT en une seule requête
          // Aucune donnée chargée en mémoire Node.js — élimination du findMany + JS loop
          const dataPoints = await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "SpaceRevenueMinuteAgg"
              ("id","tenantId","spaceId","minute","timezone","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId","revenueHt","transactionsCount","itemsCount","createdAt","updatedAt")
            SELECT
              gen_random_uuid(),
              ${tenantId},
              ${spaceId},
              date_trunc('minute', t."transactionDate"),
              'Europe/Paris',
              ${event.id},
              t."locationId",
              t."locationId",
              pm."menuItemId",
              SUM(ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)),
              COUNT(ti."id")::int,
              SUM(ti."quantity")::int,
              NOW(),
              NOW()
            FROM "WeezeventTransaction" t
            JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
            JOIN "WeezeventProductMapping" pm
              ON pm."weezeventProductId" = ti."productId" AND pm."tenantId" = ${tenantId}
            WHERE t."tenantId" = ${tenantId}
              ${integrationClause}
              ${locationClause}
              AND t."transactionDate" >= ${eventDate}
              AND t."transactionDate" < ${nextDay}
            GROUP BY
              date_trunc('minute', t."transactionDate"),
              t."locationId",
              pm."menuItemId"
            ON CONFLICT ("tenantId","spaceId","minute","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId")
            DO UPDATE SET
              "revenueHt" = EXCLUDED."revenueHt",
              "transactionsCount" = EXCLUDED."transactionsCount",
              "itemsCount" = EXCLUDED."itemsCount",
              "updatedAt" = NOW()
          `);

          // SpaceProductRevenueDailyAgg — même approche DB-level
          await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "SpaceProductRevenueDailyAgg"
              ("id","tenantId","spaceId","day","weezeventProductId","revenueHt","quantity","createdAt","updatedAt")
            SELECT
              gen_random_uuid(),
              ${tenantId},
              ${spaceId},
              ${eventDate}::date,
              ti."productId",
              SUM(ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)),
              SUM(ti."quantity")::int,
              NOW(),
              NOW()
            FROM "WeezeventTransaction" t
            JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
            WHERE t."tenantId" = ${tenantId}
              ${integrationClause}
              ${locationClause}
              AND t."transactionDate" >= ${eventDate}
              AND t."transactionDate" < ${nextDay}
              AND ti."productId" IS NOT NULL
            GROUP BY ti."productId"
            ON CONFLICT ("tenantId","spaceId","day","weezeventProductId")
            DO UPDATE SET
              "revenueHt" = EXCLUDED."revenueHt",
              "quantity" = EXCLUDED."quantity",
              "updatedAt" = NOW()
          `);

          processedCount++;
          results.push({
            eventId: event.id, eventName: event.name, date: event.eventDate,
            dataPoints, status: 'success',
          });
        } catch (err) {
          results.push({ eventId: event.id, eventName: event.name, status: 'error', error: err.message });
        }

        // Mise à jour progression DB + BullMQ après chaque event traité
        await this.prisma.aggregationJobLog.update({
          where: { id: jobLogId },
          data: { transactionsProcessed: processedCount },
        });
        await job.updateProgress(Math.min(Math.round((processedCount / events.length) * 100), 99));
      }

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'completed', completedAt: new Date(), transactionsProcessed: processedCount },
      });
      await job.updateProgress(100);
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'failed', error: err.message, completedAt: new Date() },
      });
      throw err;
    }

    return { jobId: jobLogId, processed: processedCount, total: events.length, results };
  }

  /**
   * Synchronize: cleanup + rebuild all aggregation data for a space.
   * Version BullMQ — enqueue un job full rebuild. Retourne immédiatement.
   */
  async synchronize(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Queueing synchronize for space ${spaceId}`);

    const events = await this.prisma.event.findMany({
      where: { tenantId, spaceId },
      orderBy: { eventDate: 'asc' },
      select: { id: true, eventDate: true },
    });

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: 'full',
        status: 'pending',
        fromDate: events[0]?.eventDate ?? new Date(),
        toDate: events[events.length - 1]?.eventDate ?? new Date(),
        metadata: { eventIds: events.map((e) => e.id) },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'synchronize',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued' };
  }

  /**
   * Logique de synchronisation réelle — appelée par AggregationProcessor.
   * Nettoie toutes les agrégats du space puis délègue à executeProcessEvents.
   */
  async executeSynchronize(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, jobLogId } = job.data;
    this.logger.log(`Executing synchronize for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await job.updateProgress(2);

    // Phase 1: cleanup atomique (#9)
    await this.prisma.$transaction([
      this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: { tenantId, spaceId } }),
      this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where: { tenantId, spaceId } }),
    ]);
    await job.updateProgress(5);

    // Phase 2: retraitement (executeProcessEvents gère le job log status + progression)
    const result = await this.executeProcessEvents(job);

    // Phase 3: résumé
    const summary = await this.prisma.spaceRevenueMinuteAgg.aggregate({
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
   * Marque un job log comme failed — utilisé par AggregationProcessor.onFailed.
   * updateMany (pas update) pour ne pas lever d'erreur si le job est déjà completed.
   */
  async markJobLogFailed(jobLogId: string, errorMessage: string) {
    await this.prisma.aggregationJobLog.updateMany({
      where: { id: jobLogId, status: { not: 'completed' } },
      data: { status: 'failed', error: errorMessage, completedAt: new Date() },
    });
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
      ? await this.prisma.spaceRevenueMinuteAgg.count({
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
   * Mark an event as skipped — no sales data available or deliberately excluded
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
   * #10 — Contexte complet du step 4 en un seul appel.
   * Bundle : timeline + transactionStats + weezeventEvents + hasMappings.
   * Remplace les 7 appels séparés du mounted() du wizard.
   */
  async getStep4Context(tenantId: string, spaceId: string, integrationId?: string) {
    const [timeline, weezeventEvents, mappingCount] = await Promise.all([
      this.getEventsTimelineStatus(tenantId, spaceId, integrationId),
      integrationId
        ? this.prisma.weezeventEvent.findMany({
            where: { tenantId, integrationId },
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.weezeventLocationShopMapping.count({ where: { tenantId } }),
    ]);

    return {
      ...timeline,
      weezeventEvents,
      hasMappings: mappingCount > 0,
    };
  }

  /**
   * Breakdown par shops et articles pour un événement donné.
   * Shops : depuis SpaceRevenueMinuteAgg (a weezeventEventId) — agrégé sur toutes les minutes.
   * Articles : depuis SpaceProductRevenueDailyAgg filtré par date de l'événement
   *            (le modèle n'a pas de weezeventEventId — on filtre par day).
   */
  async getEventBreakdown(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const eventDay = new Date(event.eventDate);
    eventDay.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(eventDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const [shopAggs, productAggs] = await Promise.all([
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventLocationId', 'spaceElementId'],
        where: { tenantId, spaceId, weezeventEventId: eventId },
        _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      }),
      this.prisma.spaceProductRevenueDailyAgg.groupBy({
        by: ['weezeventProductId'],
        where: { tenantId, spaceId, day: { gte: eventDay, lt: nextDay } },
        _sum: { revenueHt: true, quantity: true },
      }),
    ]);

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      shops: shopAggs.map((s) => ({
        weezeventLocationId: s.weezeventLocationId,
        spaceElementId: s.spaceElementId,
        revenueHt: Number(s._sum.revenueHt ?? 0),
        transactionsCount: s._sum.transactionsCount ?? 0,
        itemsCount: s._sum.itemsCount ?? 0,
      })),
      products: productAggs.map((p) => ({
        weezeventProductId: p.weezeventProductId,
        revenueHt: Number(p._sum.revenueHt ?? 0),
        quantity: p._sum.quantity ?? 0,
      })),
    };
  }

  /**
   * Statistiques agrégées (totaux) pour un événement donné.
   */
  async getEventStats(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const agg = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: { _all: true },
    });

    const shopCount = await this.prisma.spaceRevenueMinuteAgg.findMany({
      where: { tenantId, spaceId, weezeventEventId: eventId, weezeventLocationId: { not: null } },
      select: { weezeventLocationId: true },
      distinct: ['weezeventLocationId'],
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      revenueHt: Number(agg._sum.revenueHt ?? 0),
      transactionsCount: agg._sum.transactionsCount ?? 0,
      itemsCount: agg._sum.itemsCount ?? 0,
      shopCount: shopCount.length,
      aggregationRecords: agg._count._all,
    };
  }

  /**
   * CA par minute pour un événement — alimente l'onglet "CA / minute" dans le détail event.
   * Retourne chaque minute avec au moins 1 transaction, ordonnée chronologiquement.
   */
  async getEventMinuteChart(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const rows = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['minute'],
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      orderBy: { minute: 'asc' },
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      data: rows.map((r) => ({
        minute: r.minute,
        revenueHt: Number(r._sum.revenueHt ?? 0),
        transactionsCount: r._sum.transactionsCount ?? 0,
        itemsCount: r._sum.itemsCount ?? 0,
      })),
    };
  }
}
