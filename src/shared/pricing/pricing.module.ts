import { Module } from '@nestjs/common';
import { MenuItemPricingService } from './menu-item-pricing.service';

/**
 * Module partagé exposant le calcul de prix menu item (catalogue + Data Integration).
 * Ne dépend que de PrismaModule (@Global) → aucun risque de dépendance circulaire.
 */
@Module({
  providers: [MenuItemPricingService],
  exports: [MenuItemPricingService],
})
export class PricingModule {}
