import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEventSubcategoryDto {
  @ApiProperty({ description: "Nom de la sous-catégorie d'événement", example: 'Rock', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: "ID de la catégorie d'événement parente", example: 'cat-123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  eventCategoryId: string;

  @ApiProperty({ description: "Alias front de eventCategoryId", example: 'cat-123', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;
}
