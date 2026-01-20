import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job, JobsOptions } from 'bullmq';
import { QUEUES } from './queue.constants';

// Job types for type safety
export interface DataSyncJobData {
  type: 'weezevent' | 'stripe' | 'manual';
  tenantId: string;
  userId?: string;
  eventId?: string;
  options?: {
    fullSync?: boolean;
    startDate?: string;
    endDate?: string;
  };
}

export interface AnalyticsJobData {
  type: 'dashboard' | 'report' | 'aggregation';
  tenantId: string;
  spaceId?: string;
  params: {
    startDate?: string;
    endDate?: string;
    metrics?: string[];
    groupBy?: string;
  };
}

export interface NotificationJobData {
  type: 'email' | 'webhook' | 'push';
  tenantId: string;
  userId?: string;
  payload: Record<string, any>;
}

export interface ExportJobData {
  type: 'csv' | 'excel' | 'pdf';
  tenantId: string;
  userId: string;
  reportType: string;
  params: Record<string, any>;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUES.DATA_SYNC) private dataSyncQueue: Queue<DataSyncJobData>,
    @InjectQueue(QUEUES.ANALYTICS) private analyticsQueue: Queue<AnalyticsJobData>,
    @InjectQueue(QUEUES.NOTIFICATIONS) private notificationsQueue: Queue<NotificationJobData>,
    @InjectQueue(QUEUES.EXPORTS) private exportsQueue: Queue<ExportJobData>,
  ) {}

  // ==================== DATA SYNC JOBS ====================

  /**
   * Queue a Weezevent data sync job
   */
  async queueWeezeventSync(
    tenantId: string,
    options?: DataSyncJobData['options'],
  ): Promise<Job<DataSyncJobData>> {
    const job = await this.dataSyncQueue.add(
      'weezevent-sync',
      {
        type: 'weezevent',
        tenantId,
        options,
      },
      {
        priority: options?.fullSync ? 10 : 5, // Lower priority for full sync
        delay: 0,
      },
    );

    this.logger.log(`Queued Weezevent sync for tenant ${tenantId} (Job: ${job.id})`);
    return job;
  }

  /**
   * Queue a bulk data sync (multiple tenants)
   */
  async queueBulkSync(tenantIds: string[]): Promise<Job<DataSyncJobData>[]> {
    const jobs = await this.dataSyncQueue.addBulk(
      tenantIds.map((tenantId, index) => ({
        name: 'weezevent-sync',
        data: { type: 'weezevent' as const, tenantId },
        opts: { delay: index * 1000 }, // Stagger jobs by 1 second
      })),
    );

    this.logger.log(`Queued bulk sync for ${tenantIds.length} tenants`);
    return jobs;
  }

  // ==================== ANALYTICS JOBS ====================

  /**
   * Queue an analytics computation job
   */
  async queueAnalytics(
    tenantId: string,
    type: AnalyticsJobData['type'],
    params: AnalyticsJobData['params'],
    options?: JobsOptions,
  ): Promise<Job<AnalyticsJobData>> {
    const job = await this.analyticsQueue.add(
      `analytics-${type}`,
      { type, tenantId, params },
      {
        priority: type === 'dashboard' ? 1 : 5, // Dashboard has highest priority
        ...options,
      },
    );

    this.logger.log(`Queued ${type} analytics for tenant ${tenantId} (Job: ${job.id})`);
    return job;
  }

  /**
   * Queue dashboard refresh with high priority
   */
  async queueDashboardRefresh(
    tenantId: string,
    spaceId: string,
  ): Promise<Job<AnalyticsJobData>> {
    return this.queueAnalytics(
      tenantId,
      'dashboard',
      { metrics: ['revenue', 'transactions', 'items'] },
      { priority: 1 },
    );
  }

  // ==================== NOTIFICATION JOBS ====================

  /**
   * Queue a notification
   */
  async queueNotification(
    data: NotificationJobData,
    options?: JobsOptions,
  ): Promise<Job<NotificationJobData>> {
    const job = await this.notificationsQueue.add(
      `notification-${data.type}`,
      data,
      options,
    );

    this.logger.log(`Queued ${data.type} notification (Job: ${job.id})`);
    return job;
  }

  /**
   * Queue webhook delivery
   */
  async queueWebhook(
    tenantId: string,
    payload: Record<string, any>,
  ): Promise<Job<NotificationJobData>> {
    return this.queueNotification({
      type: 'webhook',
      tenantId,
      payload,
    });
  }

  // ==================== EXPORT JOBS ====================

  /**
   * Queue an export job
   */
  async queueExport(data: ExportJobData): Promise<Job<ExportJobData>> {
    const job = await this.exportsQueue.add(
      `export-${data.type}`,
      data,
      {
        priority: 10, // Low priority
        attempts: 2,
      },
    );

    this.logger.log(`Queued ${data.type} export for tenant ${data.tenantId} (Job: ${job.id})`);
    return job;
  }

  // ==================== JOB MANAGEMENT ====================

  /**
   * Get job by ID from any queue
   */
  async getJob(queueName: keyof typeof QUEUES, jobId: string): Promise<Job | null> {
    const queues: Record<string, Queue> = {
      DATA_SYNC: this.dataSyncQueue,
      ANALYTICS: this.analyticsQueue,
      NOTIFICATIONS: this.notificationsQueue,
      EXPORTS: this.exportsQueue,
    };

    const queue = queues[queueName];
    if (!queue) return null;

    return queue.getJob(jobId);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const queues: Record<string, Queue> = {
      [QUEUES.DATA_SYNC]: this.dataSyncQueue,
      [QUEUES.ANALYTICS]: this.analyticsQueue,
      [QUEUES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUES.EXPORTS]: this.exportsQueue,
    };

    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Get all queue stats
   */
  async getAllQueueStats(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const queueName of Object.values(QUEUES)) {
      results[queueName] = await this.getQueueStats(queueName);
    }

    return results;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queues: Record<string, Queue> = {
      [QUEUES.DATA_SYNC]: this.dataSyncQueue,
      [QUEUES.ANALYTICS]: this.analyticsQueue,
      [QUEUES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUES.EXPORTS]: this.exportsQueue,
    };

    const queue = queues[queueName];
    if (queue) {
      await queue.pause();
      this.logger.warn(`Queue ${queueName} paused`);
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queues: Record<string, Queue> = {
      [QUEUES.DATA_SYNC]: this.dataSyncQueue,
      [QUEUES.ANALYTICS]: this.analyticsQueue,
      [QUEUES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUES.EXPORTS]: this.exportsQueue,
    };

    const queue = queues[queueName];
    if (queue) {
      await queue.resume();
      this.logger.log(`Queue ${queueName} resumed`);
    }
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(queueName: string): Promise<number> {
    const queues: Record<string, Queue> = {
      [QUEUES.DATA_SYNC]: this.dataSyncQueue,
      [QUEUES.ANALYTICS]: this.analyticsQueue,
      [QUEUES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUES.EXPORTS]: this.exportsQueue,
    };

    const queue = queues[queueName];
    if (!queue) return 0;

    const failed = await queue.getFailed();
    let retried = 0;

    for (const job of failed) {
      await job.retry();
      retried++;
    }

    this.logger.log(`Retried ${retried} failed jobs in ${queueName}`);
    return retried;
  }
}
