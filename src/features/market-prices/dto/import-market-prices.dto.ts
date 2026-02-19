import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMarketPriceDto } from './create-market-price.dto';

export class ImportMarketPricesDto {
  @ApiProperty({ type: [CreateMarketPriceDto], description: 'Liste de prix à importer' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMarketPriceDto)
  items: CreateMarketPriceDto[];
}
