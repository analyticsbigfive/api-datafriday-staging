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

export enum ComponentCategory {
  Food = 'Food',
  Beverage = 'Beverage',
}

export enum ComponentType {
  Sauce = 'Sauce',
  Meat = 'Meat',
  Fish = 'Fish',
  Veg = 'Veg',
  Salad = 'Salad',
  Biscuit = 'Biscuit',
  Jus = 'Jus',
  Juice = 'Juice',
}

export enum StorageType {
  Dry = 'Dry',
  Cold = 'Cold',
  Freezer = 'Freezer',
  Material = 'Material',
  NA = 'NA',
}

export class CreateMenuComponentDto {
  @ApiProperty({ description: 'Nom du composant' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Unité (kg, liter, piece)' })
  @IsString()
  unit: string;

  @ApiProperty({ description: 'Catégorie (Food, Beverage)' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ description: 'Coût unitaire' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Allergènes', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Type de stockage (Dry, Cold, Freezer, Material, NA)' })
  @IsOptional()
  @IsString()
  storageType?: string;

  @ApiPropertyOptional({ description: 'Sous-composants JSON' })
  @IsOptional()
  subComponents?: any;

  @ApiPropertyOptional({ description: 'Catégorie de composant (Sauce, Meat, Fish, Veg, Salad, Biscuit, Jus, Juice)' })
  @IsOptional()
  @IsString()
  componentCategory?: string;

  @ApiPropertyOptional({ description: "Nombre d'unités par recette" })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  numberOfUnitsRecipe?: number;
}
