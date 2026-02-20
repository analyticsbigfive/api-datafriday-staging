import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMenuItemDto {
  @ApiProperty({ description: 'Nom de l\'article' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Type (legacy field: Beverage, Food, Combo, Glasses, Ticket, Merch, Other)' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'ID du ProductType (dynamique)' })
  @IsOptional()
  @IsString()
  typeId?: string;

  @ApiProperty({ description: 'Catégorie (legacy enum: drinks, food, merch, other)' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ description: 'ID du ProductCategory (dynamique)' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ description: 'Prix de vente de base' })
  @IsNumber()
  @Type(() => Number)
  basePrice: number;

  @ApiPropertyOptional({ description: 'Coût total calculé' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalCost?: number;

  @ApiPropertyOptional({ description: 'Marge en pourcentage' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  margin?: number;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'URL ou base64 de l\'image' })
  @IsOptional()
  @IsString()
  picture?: string;

  @ApiPropertyOptional({ description: 'Allergènes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({ description: 'Régimes alimentaires', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diet?: string[];

  @ApiPropertyOptional({ description: 'Types de stockage', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storageType?: string[];

  @ApiPropertyOptional({ description: 'Prêt à la vente: Yes, No' })
  @IsOptional()
  @IsString()
  readyForSale?: string;

  @ApiPropertyOptional({ description: 'Article combo: Yes, No' })
  @IsOptional()
  @IsString()
  comboItem?: string;

  @ApiPropertyOptional({ description: 'Nombre de pièces par recette' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  numberOfPiecesRecipe?: number;

  @ApiPropertyOptional({ description: 'Données composants JSON' })
  @IsOptional()
  componentsData?: any;
}
