import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Code unique de la permission, en dot-notation',
    example: 'menu.fb.customReports',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z][a-zA-Z0-9.]*$/, {
    message: 'code doit être en dot-notation (ex: menu.fb.customReports)',
  })
  code: string;

  @ApiProperty({
    description: 'Nom affiché de la permission',
    example: 'Rapports personnalisés F&B',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description de la permission',
    example: 'Accès aux rapports personnalisés du module F&B',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Catégorie pour le regroupement dans l\'UI',
    example: 'F&B',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
