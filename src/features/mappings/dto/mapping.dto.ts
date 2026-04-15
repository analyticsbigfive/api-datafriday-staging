import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLocationSpaceMappingDto {
  @ApiProperty({ description: 'ID de la location Weezevent' })
  @IsString()
  weezeventLocationId: string;

  @ApiProperty({ description: 'ID du Space DataFriday' })
  @IsString()
  spaceId: string;
}

export class CreateMerchantElementMappingDto {
  @ApiProperty({ description: 'ID du merchant Weezevent' })
  @IsString()
  weezeventMerchantId: string;

  @ApiProperty({ description: 'ID de l\'élément F&B du Space' })
  @IsString()
  spaceElementId: string;
}

export class CreateProductMappingDto {
  @ApiProperty({ description: 'ID du produit Weezevent' })
  @IsString()
  weezeventProductId: string;

  @ApiProperty({ description: 'ID du menu item DataFriday' })
  @IsString()
  menuItemId: string;

  @ApiPropertyOptional({ description: 'Mapping automatique' })
  @IsOptional()
  @IsBoolean()
  autoMapped?: boolean;

  @ApiPropertyOptional({ description: 'Score de confiance', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  confidence?: number;
}

export class BulkMerchantElementMappingDto {
  @ApiProperty({ description: 'Liste des mappings merchant → element', type: [CreateMerchantElementMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMerchantElementMappingDto)
  mappings: CreateMerchantElementMappingDto[];
}

export class BulkProductMappingDto {
  @ApiProperty({ description: 'Liste des mappings product → menu item', type: [CreateProductMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductMappingDto)
  mappings: CreateProductMappingDto[];
}
