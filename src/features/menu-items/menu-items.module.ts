import { Module } from '@nestjs/common';
import { MenuItemsService } from './menu-items.service';
import { MenuItemsController, ProductTypesController, ProductCategoriesController } from './menu-items.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { PricingModule } from '../../shared/pricing/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [MenuItemsController, ProductTypesController, ProductCategoriesController],
  providers: [MenuItemsService],
  exports: [MenuItemsService],
})
export class MenuItemsModule {}
