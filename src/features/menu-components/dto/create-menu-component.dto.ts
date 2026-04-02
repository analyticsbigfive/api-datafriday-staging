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
import { Type, Transform } from 'class-transformer';

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
 * 
 * Transformation automatique:
 * - ingredientId: accepte string, number, ou objet avec 'ingredientId' ou 'marketPriceId'
 * - quantity/numberOfUnits: accepte number ou string convertible en number
 */
export class MenuComponentIngredientLineDto {
  @ApiProperty({ 
    description: "ID de l'ingrédient. Accepte: string, number, ou {ingredientId/marketPriceId: string}",
    example: 'ingredient-123'
  })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null) {
      return String(value.ingredientId || value.marketPriceId || value.id || '').trim();
    }
    return String(value).trim();
  })
  @IsString({ 
    message: '❌ INGRÉDIENT (ingredients) - ingredientId invalide. ' +
             'Il s\'agit de l\'ID d\'un Ingredient (matière première comme "Tomate", "Fromage", "Farine", etc.), PAS d\'un sous-composant. ' +
             'Reçu: "$value". ' +
             'Formats acceptés: string ("ingredient-123"), number (123), ou objet ({ingredientId: "...", marketPriceId: "...", id: "..."}).'
  })
  ingredientId: string;

  @ApiProperty({ 
    description: 'Quantité utilisée (accepte aussi numberOfUnits). Accepte: number ou string convertible',
    example: 1.5
  })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'object' && value !== null) {
      const qty = value.quantity ?? value.numberOfUnits ?? 0;
      return typeof qty === 'number' ? qty : parseFloat(String(qty)) || 0;
    }
    return parseFloat(String(value)) || 0;
  })
  @IsNumber({}, { 
    message: '❌ INGRÉDIENT (ingredients) - quantity invalide. ' +
             'La quantité de l\'ingrédient doit être un nombre. ' +
             'Reçu: "$value". ' +
             'Formats acceptés: number (1.5), string ("1.5"), ou objet ({quantity: 1.5, numberOfUnits: 1.5}).'
  })
  quantity?: number;

  @ApiPropertyOptional({ description: 'Nombre d\'unités (alias de quantity pour compatibilité frontend)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  numberOfUnits?: number;

  @ApiPropertyOptional({ description: 'Unité (optionnelle)' })
  @IsOptional()
  @IsString()
  @Type(() => String)
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
 * 
 * Transformation automatique:
 * - childId: accepte string, number, ou objet avec propriété 'id' ou 'childId'
 * - quantity: accepte number, string (converti en number), ou objet avec 'quantity' ou 'numberOfUnits'
 */
export class MenuComponentChildLineDto {
  @ApiProperty({ 
    description: 'ID du sous-composant (child MenuComponent). Accepte: string, number, ou {id/childId: string}',
    example: 'component-123'
  })
  @Transform(({ value, obj }) => {
    // Store the original object for error messages
    if (typeof value === 'object' && value !== null) {
      obj._originalChildData = value;
    }
    
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null) {
      return String(value.childId || value.id || '').trim();
    }
    return String(value).trim();
  })
  @IsString({ 
    message: '❌ SOUS-COMPOSANT (children) - childId invalide. ' +
             'Composant concerné: "$property" avec données = $value. ' +
             'Il s\'agit de l\'ID d\'un MenuComponent (sous-composant), PAS d\'un ingrédient. ' +
             'Vérifiez que vous envoyez bien un ID de composant existant.'
  })
  childId: string;

  @ApiProperty({ 
    description: 'Quantité utilisée. Accepte: number, string convertible en number, ou {quantity/numberOfUnits: number}',
    example: 2.5
  })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'object' && value !== null) {
      const qty = value.quantity ?? value.numberOfUnits ?? 0;
      return typeof qty === 'number' ? qty : parseFloat(String(qty)) || 0;
    }
    return parseFloat(String(value)) || 0;
  })
  @IsNumber({}, { 
    message: '❌ SOUS-COMPOSANT (children) - quantity invalide. ' +
             'La quantité du sous-composant doit être un nombre. ' +
             'Reçu: "$value". ' +
             'Formats acceptés: number (2.5), string ("2.5"), ou objet ({quantity: 2.5, numberOfUnits: 2.5}).'
  })
  quantity: number;

  @ApiPropertyOptional({ description: 'Unité (optionnelle)' })
  @IsOptional()
  @IsString()
  @Type(() => String)
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
