import { Module } from '@nestjs/common';
import { MarketPricesService } from './market-prices.service';
import { MarketPricesController } from './market-prices.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketPricesController],
  providers: [MarketPricesService],
  exports: [MarketPricesService],
})
export class MarketPricesModule {}
