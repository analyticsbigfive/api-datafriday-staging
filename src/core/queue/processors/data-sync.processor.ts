import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue.constants';
import { DataSyncJobData } from '../queue.service';
import { WeezeventSyncService } from '../../../features/weezevent/services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from '../../../features/weezevent/services/weezevent-incremental-sync.service';
import { RedisService } from '../../redis/redis.service';

// lockDuration: 5 min — long enough for 100-product detail sync with slow DB (12-14s per DELETE).
@Processor(QUEUES.DATA_SYNC, { lockDuration: 300000 })
export class DataSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(DataSyncProcessor.name);

  constructor(
    @Inject(forwardRef(() => WeezeventSyncService))
    private readonly weezeventSyncService: WeezeventSyncService,
    @Inject(forwardRef(() => WeezeventIncrementalSyncService))
    private readonly incrementalSyncService: WeezeventIncrementalSyncService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<DataSyncJobData>): Promise<any> {
    this.logger.log(`Processing ${job.name} for tenant ${job.data.tenantId}`);

    try {
      switch (job.data.type) {
        case 'weezevent':
          return this.processWeezeventFullSync(job);
        case 'weezevent-partial':
          return this.processWeezeventPartialSync(job);
        case 'stripe':
          return this.processStripeSync(job);
        case 'manual':
          return this.processManualSync(job);
        default:
          throw new Error(`Unknown sync type: ${(job.data as any).type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${job.name}: ${(error as Error).message}`);
      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  // ==================== GRANULAR SYNC (per data type) ====================

  private async processWeezeventPartialSync(job: Job<DataSyncJobData>): Promise<any> {
    const { tenantId, syncType, options, integrationId } = job.data;

    if (!syncType) {
      throw new Error('syncType is required for weezevent-partial jobs');
    }

    if (!integrationId) {
      throw new Error('integrationId is required for weezevent-partial jobs');
    }

    this.logger.log(`Starting weezevent-${syncType} sync for tenant ${tenantId}`);
    await job.updateProgress(5);

    const fromDate = options?.startDate ? new Date(options.startDate) : undefined;
    const eventId = options?.eventId;

    let result: any;

    switch (syncType) {
      case 'transactions':
        // Transactions can be very long (cursor pagination, no total).
        // We emit checkpoints at fixed points in the process.
        await job.updateProgress(10);
        result = await this.incrementalSyncService.syncTransactionsIncremental(tenantId, integrationId, {
          forceFullSync: options?.fullSync,
          updatedSince: fromDate,
          batchSize: 500,
          maxItems: 10000,
          onProgress: async (pct: number) => {
            // Map service-reported 0-100 onto the 10-88 range
            await job.updateProgress(10 + Math.round(pct * 0.78));
          },
        });
        break;

      case 'events':
        await job.updateProgress(10);
        result = await this.incrementalSyncService.syncEventsIncremental(tenantId, integrationId, {
          forceFullSync: options?.fullSync,
          batchSize: 500,
          maxItems: 10000,
          onProgress: async (pct: number) => {
            await job.updateProgress(10 + Math.round(pct * 0.78));
          },
        });
        break;

      case 'products':
        await job.updateProgress(10);
        result = await this.weezeventSyncService.syncProducts(tenantId, integrationId);
        break;

      case 'orders':
        if (!eventId) throw new Error('eventId is required for orders sync');
        await job.updateProgress(10);
        result = await this.weezeventSyncService.syncOrders(tenantId, integrationId, eventId);
        break;

      case 'prices':
        await job.updateProgress(10);
        result = await this.weezeventSyncService.syncPrices(tenantId, integrationId, eventId);
        break;

      case 'attendees':
        if (!eventId) throw new Error('eventId is required for attendees sync');
        await job.updateProgress(10);
        result = await this.weezeventSyncService.syncAttendees(tenantId, integrationId, eventId);
        break;

      default:
        throw new Error(`Unknown syncType: ${syncType}`);
    }

    await job.updateProgress(90);
    await this.invalidateTenantCache(tenantId);
    await job.updateProgress(100);

    this.logger.log(
      `weezevent-${syncType} completed for tenant ${tenantId}: ${result?.itemsSynced ?? 0} items`,
    );

    return {
      tenantId,
      syncType,
      syncedAt: new Date().toISOString(),
      fullSync: options?.fullSync ?? false,
      ...result,
    };
  }

  // ==================== FULL SYNC (all types, used by cron) ====================

  private async processWeezeventFullSync(job: Job<DataSyncJobData>): Promise<any> {
    const { tenantId, integrationId, options } = job.data;

    if (!integrationId) {
      throw new Error('integrationId is required for weezevent full sync jobs');
    }
    
    await job.updateProgress(10);
    this.logger.log(`Starting Weezevent full sync for tenant ${tenantId}, integration ${integrationId}`);

    try {
      // Step 1: Sync transactions
      await job.updateProgress(20);
      const transactionsResult = await this.incrementalSyncService.syncTransactionsIncremental(
        tenantId,
        integrationId,
        {
          forceFullSync: options?.fullSync ?? false,
          updatedSince: options?.startDate ? new Date(options.startDate) : undefined,
        },
      );

      // Step 2: Sync events
      await job.updateProgress(50);
      const eventsResult = await this.incrementalSyncService.syncEventsIncremental(tenantId, integrationId, {
        forceFullSync: options?.fullSync ?? false,
      });

      // Step 3: Sync products
      await job.updateProgress(70);
      const productsResult = await this.weezeventSyncService.syncProducts(tenantId, integrationId);

      // Step 4: Invalidate cache
      await job.updateProgress(90);
      await this.invalidateTenantCache(tenantId);

      await job.updateProgress(100);

      return {
        tenantId,
        syncedAt: new Date().toISOString(),
        fullSync: options?.fullSync ?? false,
        status: 'completed',
        results: {
          transactions: transactionsResult,
          events: eventsResult,
          products: productsResult,
        },
      };
    } catch (error) {
      this.logger.error(`Weezevent full sync failed for tenant ${tenantId}: ${(error as Error).message}`);
      throw error;
    }
  }

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    try {
      const patterns = [
        `dashboard:${tenantId}:*`,
        `analytics:${tenantId}:*`,
        `weezevent:${tenantId}:*`,
      ];

      for (const pattern of patterns) {
        await this.redisService.deletePattern(pattern);
      }

      this.logger.log(`Cache invalidated for tenant ${tenantId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for tenant ${tenantId}: ${(error as Error).message}`);
    }
  }

  private async processStripeSync(job: Job<DataSyncJobData>): Promise<any> {
    const { tenantId } = job.data;
    this.logger.log(`Stripe sync for tenant ${tenantId} - Not implemented`);
    return { tenantId, status: 'not_implemented' };
  }

  private async processManualSync(job: Job<DataSyncJobData>): Promise<any> {
    const { tenantId } = job.data;
    this.logger.log(`Manual sync for tenant ${tenantId}`);
    return { tenantId, status: 'completed' };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<DataSyncJobData>) {
    this.logger.log(`Job ${job.id} (${job.name}) completed for tenant ${job.data.tenantId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DataSyncJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.name}) failed for tenant ${job.data.tenantId}: ${error.message}`,
    );
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<DataSyncJobData>, progress: number) {
    this.logger.debug(`Job ${job.id} (${job.name}) progress: ${progress}%`);
  }
}

