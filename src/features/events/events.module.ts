import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController } from './events.controller';
import { PredictVersionsController, PredictVersionsStandaloneController } from './predict-versions.controller';
import { PredictVersionsService } from './predict-versions.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    EventsController,
    EventTypesController,
    EventCategoriesController,
    EventSubcategoriesController,
    PredictVersionsController,
    PredictVersionsStandaloneController,
  ],
  providers: [EventsService, PredictVersionsService],
  exports: [EventsService, PredictVersionsService],
})
export class EventsModule {}
