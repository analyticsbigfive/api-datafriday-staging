import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class InventoryCountLineDto {
  @ApiProperty({ description: 'ID du packaging' })
  @IsString()
  packagingId: string;

  @ApiProperty({ description: 'Quantité comptée', type: Number })
  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({ description: 'ID du shop (point de vente)' })
  @IsOptional()
  @IsString()
  shopId?: string;
}

export class CreateInventoryCountDto {
  @ApiPropertyOptional({ description: 'ID d\'un inventaire existant (prioritaire sur spaceId+eventId)' })
  @IsOptional()
  @IsString()
  inventoryId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'espace (utilisé si inventoryId absent)' })
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'événement (utilisé si inventoryId absent)' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiProperty({ description: 'Lignes de comptage', type: [InventoryCountLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryCountLineDto)
  counts: InventoryCountLineDto[];
}
