import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController } from './events.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
