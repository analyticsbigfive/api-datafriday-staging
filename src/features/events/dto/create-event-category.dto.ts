import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
