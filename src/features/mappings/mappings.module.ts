import { Module } from '@nestjs/common';
import { MappingsService } from './mappings.service';
import { MappingsController } from './mappings.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { SpacesModule } from '../spaces/spaces.module';
import { PricingModule } from '../../shared/pricing/pricing.module';

@Module({
  imports: [PrismaModule, SpacesModule, PricingModule],
  controllers: [MappingsController],
  providers: [MappingsService],
  exports: [MappingsService],
})
export class MappingsModule {}
