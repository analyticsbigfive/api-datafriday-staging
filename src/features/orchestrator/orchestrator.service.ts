import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../core/redis/redis.service';
import { QueueService, DataSyncJobData, AnalyticsJobData } from '../../core/queue/queue.service';

/**
 * HEOS - Hybrid Event-driven Orchestrated System
 * 
 * This service acts as the central orchestrator for the DataFriday platform,
 * implementing intelligent routing between:
 * - Synchronous processing (fast, simple queries)
 * - Queue-based async processing (heavy operations)
 * - Supabase Edge Functions (CPU-intensive tasks)
 * 
 * Decision criteria:
 * - Data volume < 1000 items: Synchronous
 * - Data volume 1000-50000 items: Queue-based
 * - Data volume > 50000 items or CPU-intensive: Edge Functions
 */

export interface ProcessingContext {
  tenantId: string;
  userId?: string;
  spaceId?: string;
  estimatedItems?: number;
  operation: 'sync' | 'analytics' | 'export' | 'report';
  priority?: 'high' | 'normal' | 'low';
}

export interface ProcessingDecision {
  strategy: 'sync' | 'queue' | 'edge';
  reason: string;
  estimatedDuration: number; // in ms
  cacheKey?: string;
}

export interface ProcessingResult<T = any> {
  success: boolean;
  data?: T;
  jobId?: string;
  cached?: boolean;
  processingTime: number;
  strategy: ProcessingDecision['strategy'];
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  
  // Thresholds for routing decisions
  private readonly SYNC_THRESHOLD = 1000; // Items below this: sync
  private readonly QUEUE_THRESHOLD = 50000; // Items below this: queue, above: edge
  private readonly CACHE_TTL_DASHBOARD = 60; // 1 minute for dashboard data
  private readonly CACHE_TTL_ANALYTICS = 300; // 5 minutes for analytics
  
  // Supabase Edge Function URL
  private readonly edgeFunctionUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1`;
  }

  /**
   * Decide the best processing strategy based on context
   */
  decideStrategy(context: ProcessingContext): ProcessingDecision {
    const { estimatedItems = 0, operation, priority } = context;

    // High priority always goes sync if possible
    if (priority === 'high' && estimatedItems < this.SYNC_THRESHOLD) {
      return {
        strategy: 'sync',
        reason: 'High priority with small dataset',
        estimatedDuration: estimatedItems * 2, // ~2ms per item
      };
    }

    // Route based on data volume
    if (estimatedItems < this.SYNC_THRESHOLD) {
      return {
        strategy: 'sync',
        reason: `Small dataset (${estimatedItems} items)`,
        estimatedDuration: estimatedItems * 2,
        cacheKey: this.buildCacheKey(context),
      };
    }

    if (estimatedItems < this.QUEUE_THRESHOLD) {
      return {
        strategy: 'queue',
        reason: `Medium dataset (${estimatedItems} items) - using job queue`,
        estimatedDuration: estimatedItems * 0.5, // ~0.5ms per item with parallel processing
      };
    }

    // Large datasets or CPU-intensive operations go to Edge Functions
    return {
      strategy: 'edge',
      reason: `Large dataset (${estimatedItems} items) - offloading to Edge Function`,
      estimatedDuration: estimatedItems * 0.2, // ~0.2ms per item with edge computing
    };
  }

  /**
   * Process a data sync request with intelligent routing
   */
  async processSync(
    context: ProcessingContext,
    syncFn: () => Promise<any>,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const decision = this.decideStrategy(context);

    this.logger.log(
      `[HEOS] Processing sync for tenant ${context.tenantId} - Strategy: ${decision.strategy} (${decision.reason})`,
    );

    try {
      switch (decision.strategy) {
        case 'sync':
          return this.processSynchronously(context, syncFn, decision, startTime);

        case 'queue':
          return this.processViaQueue(context, startTime);

        case 'edge':
          return this.processViaEdgeFunction(context, startTime);

        default:
          throw new Error(`Unknown strategy: ${decision.strategy}`);
      }
    } catch (error) {
      this.logger.error(`[HEOS] Processing failed: ${error.message}`);
      return {
        success: false,
        processingTime: Date.now() - startTime,
        strategy: decision.strategy,
      };
    }
  }

  /**
   * Process analytics request
   */
  async processAnalytics(
    context: ProcessingContext,
    computeFn: () => Promise<any>,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(context);

    // Check cache first
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      this.logger.debug(`[HEOS] Cache HIT for analytics: ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
        processingTime: Date.now() - startTime,
        strategy: 'sync',
      };
    }

    const decision = this.decideStrategy(context);

    if (decision.strategy === 'sync') {
      const data = await computeFn();
      
      // Cache the result
      await this.redisService.set(cacheKey, data, { ttl: this.CACHE_TTL_ANALYTICS });

      return {
        success: true,
        data,
        cached: false,
        processingTime: Date.now() - startTime,
        strategy: 'sync',
      };
    }

    // Queue for background processing
    const job = await this.queueService.queueAnalytics(
      context.tenantId,
      'aggregation',
      {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
      },
    );

    return {
      success: true,
      jobId: job.id,
      processingTime: Date.now() - startTime,
      strategy: 'queue',
    };
  }

  /**
   * Get dashboard data with caching
   */
  async getDashboardData(
    tenantId: string,
    spaceId: string,
    fetchFn: () => Promise<any>,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const cacheKey = `dashboard:${tenantId}:${spaceId}`;

    // Check cache
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      this.logger.debug(`[HEOS] Dashboard cache HIT: ${cacheKey}`);
      return {
        success: true,
        data: cached,
        cached: true,
        processingTime: Date.now() - startTime,
        strategy: 'sync',
      };
    }

    // Fetch fresh data
    const data = await fetchFn();

    // Cache with short TTL
    await this.redisService.set(cacheKey, data, { ttl: this.CACHE_TTL_DASHBOARD });

    return {
      success: true,
      data,
      cached: false,
      processingTime: Date.now() - startTime,
      strategy: 'sync',
    };
  }

  /**
   * Invalidate cache for a tenant/space
   */
  async invalidateCache(tenantId: string, spaceId?: string): Promise<void> {
    const pattern = spaceId 
      ? `*:${tenantId}:${spaceId}*`
      : `*:${tenantId}:*`;
    
    await this.redisService.deletePattern(pattern);
    this.logger.log(`[HEOS] Cache invalidated for pattern: ${pattern}`);
  }

  // ==================== PRIVATE METHODS ====================

  private buildCacheKey(context: ProcessingContext): string {
    const parts = [context.operation, context.tenantId];
    if (context.spaceId) parts.push(context.spaceId);
    return parts.join(':');
  }

  private async processSynchronously(
    context: ProcessingContext,
    syncFn: () => Promise<any>,
    decision: ProcessingDecision,
    startTime: number,
  ): Promise<ProcessingResult> {
    // Check cache if available
    if (decision.cacheKey) {
      const cached = await this.redisService.get<any>(decision.cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached,
          cached: true,
          processingTime: Date.now() - startTime,
          strategy: 'sync',
        };
      }
    }

    // Execute synchronously
    const data = await syncFn();

    // Cache result
    if (decision.cacheKey) {
      await this.redisService.set(decision.cacheKey, data, { ttl: 300 });
    }

    return {
      success: true,
      data,
      cached: false,
      processingTime: Date.now() - startTime,
      strategy: 'sync',
    };
  }

  private async processViaQueue(
    context: ProcessingContext,
    startTime: number,
  ): Promise<ProcessingResult> {
    const job = await this.queueService.queueWeezeventSync(context.tenantId, {
      fullSync: context.operation === 'sync',
    });

    return {
      success: true,
      jobId: job.id,
      processingTime: Date.now() - startTime,
      strategy: 'queue',
    };
  }

  private async processViaEdgeFunction(
    context: ProcessingContext,
    startTime: number,
  ): Promise<ProcessingResult> {
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    
    try {
      const response = await fetch(`${this.edgeFunctionUrl}/heavy-processing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          tenantId: context.tenantId,
          operation: context.operation,
          estimatedItems: context.estimatedItems,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
        processingTime: Date.now() - startTime,
        strategy: 'edge',
      };
    } catch (error) {
      this.logger.error(`[HEOS] Edge function error: ${error.message}`);
      
      // Fallback to queue
      this.logger.warn('[HEOS] Falling back to queue processing');
      return this.processViaQueue(context, startTime);
    }
  }

  /**
   * Health check for all processing backends
   */
  async healthCheck(): Promise<{
    redis: boolean;
    queues: Record<string, any>;
    edgeFunction: boolean;
  }> {
    const [redisOk, queueStats] = await Promise.all([
      this.redisService.ping(),
      this.queueService.getAllQueueStats(),
    ]);

    // Check edge function
    let edgeOk = false;
    try {
      const response = await fetch(`${this.edgeFunctionUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.configService.get('SUPABASE_ANON_KEY')}`,
        },
      });
      edgeOk = response.ok;
    } catch {
      edgeOk = false;
    }

    return {
      redis: redisOk,
      queues: queueStats,
      edgeFunction: edgeOk,
    };
  }
}
