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
          url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 500, // Keep last 500 failed jobs
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
