import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsInt, IsEmail } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Prénom du propriétaire',
    example: 'Jean',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    description: 'Nom de famille du propriétaire',
    example: 'Dupont',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    description: 'Nom de l\'organisation',
    example: 'Mon Restaurant',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  organizationName: string;

  @ApiProperty({
    description: 'Type d\'organisation',
    example: 'Restaurant',
    enum: ['Restaurant', 'Hotel', 'Bar', 'Event', 'Autre'],
  })
  @IsString()
  @IsNotEmpty()
  organizationType: string;

  @ApiProperty({
    description: 'Email de l\'organisation',
    example: 'contact@monrestaurant.fr',
  })
  @IsEmail()
  @IsNotEmpty()
  organizationEmail: string;

  @ApiProperty({
    description: 'Téléphone de l\'organisation',
    example: '+33612345678',
  })
  @IsString()
  @IsNotEmpty()
  organizationPhone: string;

  @ApiPropertyOptional({
    description: 'Numéro SIRET',
    example: '12345678901234',
  })
  @IsString()
  @IsOptional()
  siret?: string;

  @ApiPropertyOptional({
    description: 'Adresse',
    example: '123 Rue de Paris',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'Ville',
    example: 'Paris',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'Code postal',
    example: '75001',
  })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Pays',
    example: 'France',
    default: 'France',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    description: 'Nombre d\'employés',
    example: 10,
  })
  @IsInt()
  @IsOptional()
  numberOfEmployees?: number;

  @ApiPropertyOptional({
    description: 'Nombre d\'espaces/établissements',
    example: 2,
  })
  @IsInt()
  @IsOptional()
  numberOfSpaces?: number;

  @ApiPropertyOptional({
    description: 'Méthode de paiement préférée',
    example: 'Card',
    enum: ['Card', 'Transfer', 'Direct Debit'],
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
