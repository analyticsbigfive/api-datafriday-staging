import { Module } from '@nestjs/common';
import { MarketPricesService } from './market-prices.service';
import { MarketPricesController } from './market-prices.controller';
import { MarketPriceTaxonomyService } from './market-price-taxonomy.service';
import {
  MarketPriceTypesController,
  MarketPriceCategoriesController,
} from './market-price-taxonomy.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    MarketPricesController,
    MarketPriceTypesController,
    MarketPriceCategoriesController,
  ],
  providers: [MarketPricesService, MarketPriceTaxonomyService],
  exports: [MarketPricesService, MarketPriceTaxonomyService],
})
export class MarketPricesModule {}
