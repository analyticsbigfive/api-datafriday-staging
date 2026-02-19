import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum GoodType {
  Food = 'Food',
  Beverage = 'Beverage',
  Packaging = 'Packaging',
  Other = 'Other',
}

export class CreateMarketPriceDto {
  @ApiProperty({ description: 'Nom du produit' })
  @IsString()
  itemName: string;

  @ApiProperty({ description: 'Unité (kg, l, unit, etc.)' })
  @IsString()
  unit: string;

  @ApiProperty({ description: 'Prix', type: Number })
  @IsNumber()
  @Type(() => Number)
  price: number;

  @ApiProperty({ enum: GoodType, description: 'Type de produit' })
  @IsEnum(GoodType)
  goodType: GoodType;

  @ApiProperty({ required: false, description: 'Catégorie produit' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false, description: 'Image URL' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ required: false, description: 'Nom fournisseur' })
  @IsString()
  @IsOptional()
  supplier?: string;

  @ApiProperty({ required: false, description: 'ID fournisseur' })
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ required: false, description: 'Nom article chez le fournisseur' })
  @IsString()
  @IsOptional()
  supplierItem?: string;

  @ApiProperty({ required: false, description: 'Unité recette' })
  @IsString()
  @IsOptional()
  recipeUnit?: string;

  @ApiProperty({ required: false, description: 'Conversion unité achat → recette' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  purchaseUnitConversion?: number;

  @ApiProperty({ required: false, description: 'Prix par unité' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pricePerUnit?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  packedUnits?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  numberOfUnits?: number;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  unitsPerPurchase?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  packingWidth?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  packingHeight?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  packingLength?: number;
}
