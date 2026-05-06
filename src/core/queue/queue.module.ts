import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QUEUES } from './queue.constants';
import { DataSyncProcessor } from './processors/data-sync.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { WeezeventModule } from '../../features/weezevent/weezevent.module';
import { RedisModule } from '../redis/redis.module';

// Re-export QUEUES for backward compatibility
export { QUEUES } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          // Use REDIS_QUEUE_URL (dedicated queue Redis, e.g. local Docker redis) if available,
          // otherwise fall back to REDIS_URL (Upstash). Using Upstash for BullMQ workers
          // exhausts the free-tier request quota quickly due to constant polling.
          url: configService.get<string>(
            'REDIS_QUEUE_URL',
            configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
          ),
        },
        defaultJobOptions: {
          removeOnComplete: 20, // Keep only last 20 completed jobs
          removeOnFail: 20,    // Keep only last 20 failed jobs (was 500 — stored in Redis)
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUES.DATA_SYNC },
      { name: QUEUES.ANALYTICS },
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.EXPORTS },
    ),
    forwardRef(() => WeezeventModule),
    RedisModule.forRoot(),
  ],
  providers: [
    QueueService,
    DataSyncProcessor,
    AnalyticsProcessor,
    NotificationProcessor,
  ],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
