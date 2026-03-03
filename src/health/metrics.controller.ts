import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedisService } from '../core/redis/redis.service';
import { PrismaService } from '../core/database/prisma.service';
import { QueueService } from '../core/queue/queue.service';

/**
 * P2: Metrics endpoint for monitoring performance and health
 */
@ApiTags('Health')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get system metrics and performance stats' })
  async getMetrics() {
    const [redisInfo, queueStats, dbStats] = await Promise.all([
      this.getRedisMetrics(),
      this.getQueueMetrics(),
      this.getDatabaseMetrics(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      redis: redisInfo,
      queues: queueStats,
      database: dbStats,
      optimizations: {
        p0_security: {
          helmet: true,
          cors_configured: true,
          rate_limiting: true,
          compression: true,
        },
        p1_performance: {
          auth_cache: true,
          batch_refresh_costs: true,
          parallel_weezevent_sync: true,
        },
        p2_scalability: {
          connection_pooling: true,
          compression: true,
          monitoring: true,
        },
      },
    };
  }

  @Get('cache')
  @ApiOperation({ summary: 'Get cache performance metrics' })
  async getCacheMetrics() {
    return this.getRedisMetrics();
  }

  @Get('queues')
  @ApiOperation({ summary: 'Get queue performance metrics' })
  async getQueueMetrics() {
    const stats = await this.queueService.getAllQueueStats();
    
    return {
      dataSyncQueue: stats['data-sync'] || {},
      analyticsQueue: stats['analytics'] || {},
      totalJobs: Object.values(stats).reduce((sum: number, q: any) => sum + (q.waiting || 0) + (q.active || 0), 0),
    };
  }

  @Get('database')
  @ApiOperation({ summary: 'Get database performance metrics' })
  async getDatabaseMetrics() {
    const [tenantCount, userCount, menuItemCount, transactionCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.menuItem.count({ where: { deletedAt: null } }),
      this.prisma.weezeventTransaction.count(),
    ]);

    return {
      tenants: tenantCount,
      users: userCount,
      menuItems: menuItemCount,
      weezeventTransactions: transactionCount,
      connectionPool: {
        configured: true,
        timeout: '30s',
        keepAlive: '65s',
      },
    };
  }

  private async getRedisMetrics() {
    try {
      const info = await this.redis.info();
      const lines = info.split('\r\n');
      
      const getMetric = (key: string) => {
        const line = lines.find(l => l.startsWith(key));
        return line ? line.split(':')[1] : 'N/A';
      };

      const hits = parseInt(getMetric('keyspace_hits') || '0');
      const misses = parseInt(getMetric('keyspace_misses') || '0');
      const total = hits + misses;
      const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0';

      return {
        connected: await this.redis.ping(),
        hitRate: `${hitRate}%`,
        hits,
        misses,
        memoryUsed: getMetric('used_memory_human'),
        connectedClients: getMetric('connected_clients'),
        uptime: getMetric('uptime_in_seconds'),
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }
}
