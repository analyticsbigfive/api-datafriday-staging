import { Module } from '@nestjs/common';
import { SpacesController, ConfigurationsController } from './spaces.controller';
import { PinnedSpacesController } from './pinned-spaces.controller';
import { DashboardController } from './dashboard.controller';
import { SpacesService } from './spaces.service';
import { SpaceDashboardService } from './services/space-dashboard.service';
import { SpaceAggregationService } from './services/space-aggregation.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { WeezeventModule } from '../weezevent/weezevent.module';

@Module({
  imports: [PrismaModule, RedisModule, WeezeventModule],
  controllers: [
    SpacesController,
    ConfigurationsController,
    PinnedSpacesController,
    DashboardController,
  ],
  providers: [
    SpacesService,
    SpaceDashboardService,
    SpaceAggregationService,
  ],
  exports: [
    SpacesService,
    SpaceDashboardService,
    SpaceAggregationService,
  ],
})
export class SpacesModule {}
