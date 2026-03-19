import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateIngredientDto {
  @ApiProperty({ description: 'Nom de l’ingrédient', example: 'Farine' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Unité recette', example: 'kg' })
  @IsOptional()
  @IsString()
  recipeUnit?: string;

  @ApiPropertyOptional({ description: 'Unité d’achat', example: 'sac' })
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

  @ApiPropertyOptional({ description: 'Coût par unité recette', example: 2.5, type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  costPerRecipeUnit?: number;

  @ApiPropertyOptional({ description: 'Coût par unité d’achat', example: 25, type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  costPerPurchaseUnit?: number;

  @ApiPropertyOptional({ description: 'Catégorie d’ingrédient', example: 'Epicerie' })
  @IsOptional()
  @IsString()
  ingredientCategory?: string;

  @ApiPropertyOptional({ description: 'Nombre d’unités d’achat par unité recette', example: 10, type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  purchaseUnitsPerRecipeUnit?: number;

  @ApiPropertyOptional({ description: 'Indique si l’ingrédient est actif', example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
