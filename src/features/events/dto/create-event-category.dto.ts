import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEventCategoryDto {
  @ApiProperty({ description: "Nom de la catégorie d'événement", example: 'Musique', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: "ID du type d'événement parent", example: 'type-123' })
  @IsString()
  @IsNotEmpty()
  eventTypeId: string;

  @ApiProperty({ description: 'Indique si la catégorie oppose une équipe à domicile', example: false, required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasHomeTeam?: boolean;
}
