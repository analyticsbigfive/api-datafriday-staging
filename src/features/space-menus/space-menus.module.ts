import { Module } from '@nestjs/common';
import { SpaceMenusController } from './space-menus.controller';
import { SpaceMenusService } from './space-menus.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { PricingModule } from '../../shared/pricing/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [SpaceMenusController],
  providers: [SpaceMenusService],
})
export class SpaceMenusModule {}
