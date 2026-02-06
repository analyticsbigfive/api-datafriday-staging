import { IsString, IsOptional, IsNotEmpty, IsInt, Min, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConfigDto {
  @ApiPropertyOptional({
    description: 'ID de la configuration (optionnel, généré si non fourni)',
    example: 'config-1234567890',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({
    description: 'Nom de la configuration',
    example: 'Main Configuration',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'ID de l\'espace auquel appartient cette configuration',
    example: 'space-abc123',
  })
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @ApiPropertyOptional({
    description: 'Capacité de la configuration',
    example: 5000,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Données de configuration (floors, forecourt, externalMerch, etc.)',
    example: {
      floors: [
        {
          id: '1',
          name: 'Ground Floor',
          level: 0,
          width: 100,
          height: 4,
          length: 100,
          elements: []
        }
      ],
      forecourt: null,
      externalMerch: null
    },
  })
  @IsObject()
  @IsOptional()
  data?: any;
}
