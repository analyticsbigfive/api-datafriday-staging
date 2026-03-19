import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateProductTypeDto {
  @ApiProperty({ description: 'Nom du type de produit', example: 'Food' })
  @IsString()
  name: string;
}
