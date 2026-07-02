import { PartialType } from '@nestjs/swagger';
import { CreateMarketPriceTypeDto } from './create-market-price-type.dto';

export class UpdateMarketPriceTypeDto extends PartialType(CreateMarketPriceTypeDto) {}
