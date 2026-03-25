import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  IsEnum,
  ValidateNested,
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

/**
 * DTO pour définir une ligne d'ingrédient dans un composant.
 * Note: Les champs supplémentaires envoyés sont automatiquement ignorés par le ValidationPipe.
 * Seuls les champs définis ci-dessous sont utilisés pour créer la relation ComponentIngredient.
 */
export class MenuComponentIngredientLineDto {
  @ApiProperty({ description: "ID de l'ingrédient" })
  @IsString()
  ingredientId: string;

  @ApiProperty({ description: 'Quantité utilisée (accepte aussi numberOfUnits)' })
  @IsNumber()
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Nombre d\'unités (alias de quantity pour compatibilité frontend)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  numberOfUnits?: number;

  @ApiPropertyOptional({ description: 'Unité (optionnelle)' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Coût unitaire (optionnel, peut être recalculé)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Coût total de la ligne (optionnel, peut être recalculé)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cost?: number;
}

/**
 * DTO pour définir une ligne de sous-composant (relation parent → child).
 * Note: Les champs supplémentaires envoyés (storageType, itemName, etc.) sont automatiquement
 * ignorés par le ValidationPipe. Seuls les champs définis ci-dessous sont utilisés pour créer
 * la relation ComponentComponent. Les autres informations du composant enfant sont accessibles
 * via la relation child.
 */
export class MenuComponentChildLineDto {
  @ApiProperty({ description: 'ID du sous-composant (child MenuComponent)' })
  @IsString()
  childId: string;

  @ApiProperty({ description: 'Quantité utilisée' })
  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unité (optionnelle)' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Coût total de la ligne (optionnel, peut être recalculé)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cost?: number;
}

export class ReplaceMenuComponentIngredientsDto {
  @ApiProperty({ description: "Liste complète des lignes d'ingrédients", type: [MenuComponentIngredientLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuComponentIngredientLineDto)
  ingredients: MenuComponentIngredientLineDto[];
}

export class ReplaceMenuComponentChildrenDto {
  @ApiProperty({ description: 'Liste complète des sous-composants (children)', type: [MenuComponentChildLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuComponentChildLineDto)
  children: MenuComponentChildLineDto[];
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

  @ApiPropertyOptional({ description: "Lignes d'ingrédients (source de vérité)", type: [MenuComponentIngredientLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuComponentIngredientLineDto)
  ingredients?: MenuComponentIngredientLineDto[];

  @ApiPropertyOptional({ description: 'Sous-composants (relation parent→child) (source de vérité)', type: [MenuComponentChildLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuComponentChildLineDto)
  children?: MenuComponentChildLineDto[];

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
