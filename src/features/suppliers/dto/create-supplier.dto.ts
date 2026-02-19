import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsArray } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Nom du fournisseur' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email de contact', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Téléphone', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Adresse', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ description: 'Ville', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ description: 'Code postal', required: false })
  @IsString()
  @IsOptional()
  postcode?: string;

  @ApiProperty({ description: 'Image URL', required: false })
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiProperty({ description: 'Contact name', required: false })
  @IsString()
  @IsOptional()
  contactName?: string;

  @ApiProperty({ description: 'Space IDs (sites)', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  spaceIds?: string[];

  @ApiProperty({ description: 'Configuration IDs per space', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  configurationIds?: string[];

  @ApiProperty({ description: 'Sectors', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  sectors?: string[];

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
