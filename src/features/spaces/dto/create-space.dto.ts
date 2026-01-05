import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSpaceDto {
  @ApiProperty({
    description: 'Nom de l\'espace/établissement',
    example: 'Restaurant Le Gourmet',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image de l\'espace',
    example: 'https://example.com/images/restaurant.jpg',
  })
  @IsString()
  @IsOptional()
  image?: string;
}
