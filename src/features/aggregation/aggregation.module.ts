import { Module } from '@nestjs/common';
import { AggregationService } from './aggregation.service';
import { AggregationController } from './aggregation.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AggregationController],
  providers: [AggregationService],
  exports: [AggregationService],
})
export class AggregationModule {}
