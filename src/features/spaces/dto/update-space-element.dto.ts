import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ElementTypeEnum {
  access = 'access',
  hospitality = 'hospitality',
  entertainment = 'entertainment',
  shop = 'shop',
  merchshop = 'merchshop',
  entrance = 'entrance',
  storage = 'storage',
  kitchen = 'kitchen',
  fnb_food = 'fnb_food',
  fnb_beverages = 'fnb_beverages',
  fnb_bar = 'fnb_bar',
  fnb_snack = 'fnb_snack',
  fnb_icecream = 'fnb_icecream',
  seating = 'seating',
  stage = 'stage',
  parking = 'parking',
  restroom = 'restroom',
  office = 'office',
  other = 'other',
}

export class UpdateSpaceElementDto {
  @ApiPropertyOptional({ description: 'Nom du shop' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'URL ou base64 de l\'image du shop' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'Notes libres' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ElementTypeEnum, description: 'Type principal de l\'élément' })
  @IsOptional()
  @IsEnum(ElementTypeEnum)
  type?: ElementTypeEnum;

  @ApiPropertyOptional({ type: [String], description: 'Sous-types shop (Food, Beverages, etc.)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopTypes?: string[];
}
