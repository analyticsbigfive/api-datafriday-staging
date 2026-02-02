import { IsString, IsOptional, IsNotEmpty, MaxLength, IsInt, Min, Max, IsEmail, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSpaceDto {
  // ==================== Basic Information ====================
  @ApiProperty({
    description: 'Nom de l\'espace/établissement',
    example: 'Emirates Stadium',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'URL de l\'image de l\'espace',
    example: 'https://example.com/images/stadium.jpg',
  })
  @IsString()
  @IsOptional()
  image?: string;

  // ==================== Space Details ====================
  @ApiPropertyOptional({
    description: 'Type d\'espace',
    example: 'Stadium',
    enum: ['Stadium', 'Arena', 'Zenith', 'Indoor Festival', 'Outdoor Festival', 'Indoor Show Venue', 'Outdoor Show Venue', 'Other'],
  })
  @IsString()
  @IsOptional()
  spaceType?: string;

  @ApiPropertyOptional({
    description: 'Description du type si "Other" est sélectionné',
    example: 'Convention Center',
  })
  @IsString()
  @IsOptional()
  spaceTypeOther?: string;

  @ApiPropertyOptional({
    description: 'Capacité maximale',
    example: 60000,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxCapacity?: number;

  @ApiPropertyOptional({
    description: 'Numéro de département français (01-95)',
    example: 75,
  })
  @IsInt()
  @Min(1)
  @Max(95)
  @IsOptional()
  @Type(() => Number)
  department?: number;

  @ApiPropertyOptional({
    description: 'Équipe résidente',
    example: 'Arsenal FC',
  })
  @IsString()
  @IsOptional()
  homeTeam?: string;

  // ==================== Address ====================
  @ApiPropertyOptional({
    description: 'Adresse ligne 1',
    example: 'Hornsey Road',
  })
  @IsString()
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional({
    description: 'Adresse ligne 2',
    example: 'Highbury House',
  })
  @IsString()
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional({
    description: 'Ville',
    example: 'London',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'Code postal',
    example: 'N7 7AJ',
  })
  @IsString()
  @IsOptional()
  postcode?: string;

  @ApiPropertyOptional({
    description: 'Pays',
    example: 'United Kingdom',
  })
  @IsString()
  @IsOptional()
  country?: string;

  // ==================== Contact Information ====================
  @ApiPropertyOptional({
    description: 'Téléphone de l\'espace',
    example: '+44 20 7619 5003',
  })
  @IsString()
  @IsOptional()
  tel?: string;

  @ApiPropertyOptional({
    description: 'Email de l\'espace',
    example: 'info@arsenal.com',
  })
  @ValidateIf((o) => o.email && o.email.length > 0)
  @IsEmail()
  @IsOptional()
  email?: string;

  // ==================== Main Contact Person ====================
  @ApiPropertyOptional({
    description: 'Nom du contact principal',
    example: 'John Smith',
  })
  @IsString()
  @IsOptional()
  mainContactPerson?: string;

  @ApiPropertyOptional({
    description: 'Email du contact principal',
    example: 'john.smith@arsenal.com',
  })
  @ValidateIf((o) => o.contactEmail && o.contactEmail.length > 0)
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({
    description: 'Téléphone du contact principal',
    example: '+44 20 1234 5678',
  })
  @IsString()
  @IsOptional()
  contactTel?: string;

  // ==================== Social Media ====================
  @ApiPropertyOptional({
    description: 'Compte Instagram',
    example: '@arsenal',
  })
  @IsString()
  @IsOptional()
  instagram?: string;

  @ApiPropertyOptional({
    description: 'Compte TikTok',
    example: '@arsenal',
  })
  @IsString()
  @IsOptional()
  tiktok?: string;

  @ApiPropertyOptional({
    description: 'Compte Facebook',
    example: '@arsenal',
  })
  @IsString()
  @IsOptional()
  facebook?: string;

  @ApiPropertyOptional({
    description: 'Compte Twitter/X',
    example: '@arsenal',
  })
  @IsString()
  @IsOptional()
  twitter?: string;
}
