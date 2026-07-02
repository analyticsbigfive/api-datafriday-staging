import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateMarketPriceTypeDto {
  @ApiProperty({ description: 'Nom du Market Price Type', example: 'Beverage' })
  @IsString()
  name: string;
}
