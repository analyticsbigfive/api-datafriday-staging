import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePackagingDto {
  @ApiProperty({ description: 'Nom du packaging', example: 'Gobelet carton 33cl' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Unité recette', example: 'unit' })
  @IsOptional()
  @IsString()
  recipeUnit?: string;

  @ApiPropertyOptional({ description: 'Unité d’achat', example: 'box' })
  @IsOptional()
  @IsString()
  purchaseUnit?: string;

  @ApiPropertyOptional({ description: 'Nom du fournisseur', example: 'Metro' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Type de stockage', example: 'dry' })
  @IsOptional()
  @IsString()
  storageType?: string;

  @ApiPropertyOptional({ description: 'ID du prix marché lié' })
  @IsOptional()
  @IsString()
  marketPriceId?: string;

  @ApiPropertyOptional({ description: 'Coût par unité recette', type: Number, example: 0.12 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  costPerRecipeUnit?: number;

  @ApiPropertyOptional({ description: 'Coût par unité d’achat', type: Number, example: 12 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  costPerPurchaseUnit?: number;

  @ApiPropertyOptional({ description: 'Catégorie de packaging', example: 'Service' })
  @IsOptional()
  @IsString()
  ingredientCategory?: string;

  @ApiPropertyOptional({ description: 'Nombre d’unités d’achat par unité recette', type: Number, example: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  purchaseUnitsPerRecipeUnit?: number;

  @ApiPropertyOptional({ description: 'Indique si le packaging est actif', example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
