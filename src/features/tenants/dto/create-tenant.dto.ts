import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  Matches,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ description: 'Nom du tenant', example: 'DataFriday Paris' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Slug unique du tenant', example: 'datafriday-paris' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiPropertyOptional({ description: 'Domaine personnalisé', example: 'paris.datafriday.app' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ description: 'URL du logo du tenant' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ enum: TenantPlan, description: 'Plan commercial du tenant' })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional({ description: 'Type d’organisation', example: 'Restaurant group' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  organizationType?: string;

  @ApiPropertyOptional({ description: 'Numéro SIRET' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  siret?: string;

  @ApiPropertyOptional({ description: 'Adresse postale' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'Ville' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Code postal' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Pays', example: 'France' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  @ApiPropertyOptional({ description: 'Email de contact' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Téléphone de contact' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Nombre d’employés' })
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfEmployees?: number;

  @ApiPropertyOptional({ description: 'Nombre d’espaces' })
  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfSpaces?: number;

  // Weezevent Integration
  @ApiPropertyOptional({ description: 'Active l’intégration Weezevent' })
  @IsOptional()
  @IsBoolean()
  weezeventEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Identifiant organisation Weezevent' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  weezeventOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Client ID Weezevent' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  weezeventClientId?: string;

  @ApiPropertyOptional({ description: 'Client secret Weezevent' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  weezeventClientSecret?: string;
}
