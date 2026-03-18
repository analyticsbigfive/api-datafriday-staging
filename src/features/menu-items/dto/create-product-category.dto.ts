import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProductCategoryDto {
  @ApiProperty({ description: 'Nom de la catégorie de produit', example: 'Food', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'ID du type de produit parent', example: 'type-123', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  typeId?: string;

  @ApiProperty({ description: 'Alias front de typeId', example: 'type-123', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productTypeId?: string;
}
