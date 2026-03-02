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

export class MenuItemComponentLineDto {
  @ApiProperty({ description: 'ID du composant (MenuComponent)' })
  @IsString()
  componentId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Type(() => Number)
  numberOfUnits: number;
}

export class MenuItemIngredientLineDto {
  @ApiProperty({ description: "ID de l'ingrédient" })
  @IsString()
  ingredientId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Type(() => Number)
  numberOfUnits: number;
}

export class MenuItemPackagingLineDto {
  @ApiProperty({ description: 'ID du packaging' })
  @IsString()
  packagingId: string;

  @ApiProperty({ description: "Nombre d'unités" })
  @IsNumber()
  @Type(() => Number)
  numberOfUnits: number;
}

export class ReplaceMenuItemComponentsDto {
  @ApiProperty({ description: 'Liste complète des composants', type: [MenuItemComponentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComponentLineDto)
  components: MenuItemComponentLineDto[];
}

export class ReplaceMenuItemIngredientsDto {
  @ApiProperty({ description: 'Liste complète des ingrédients', type: [MenuItemIngredientLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemIngredientLineDto)
  ingredients: MenuItemIngredientLineDto[];
}

export class ReplaceMenuItemPackagingsDto {
  @ApiProperty({ description: 'Liste complète des packagings', type: [MenuItemPackagingLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPackagingLineDto)
  packagings: MenuItemPackagingLineDto[];
}

export class CreateMenuItemDto {
  @ApiProperty({ description: 'Nom de l\'article' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'ID du ProductType' })
  @IsString()
  typeId: string;

  @ApiProperty({ description: 'ID du ProductCategory' })
  @IsString()
  categoryId: string;

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

  @ApiPropertyOptional({ description: 'Composants (source de vérité)', type: [MenuItemComponentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemComponentLineDto)
  components?: MenuItemComponentLineDto[];

  @ApiPropertyOptional({ description: 'Ingrédients (source de vérité)', type: [MenuItemIngredientLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemIngredientLineDto)
  ingredients?: MenuItemIngredientLineDto[];

  @ApiPropertyOptional({ description: 'Packagings (source de vérité)', type: [MenuItemPackagingLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPackagingLineDto)
  packagings?: MenuItemPackagingLineDto[];
}
