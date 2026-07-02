import { PartialType } from '@nestjs/swagger';
import { CreateMarketPriceCategoryDto } from './create-market-price-category.dto';

export class UpdateMarketPriceCategoryDto extends PartialType(CreateMarketPriceCategoryDto) {}
