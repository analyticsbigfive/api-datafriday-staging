import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { QueueModule } from '../core/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [HealthController, MetricsController],
})
export class HealthModule {}
