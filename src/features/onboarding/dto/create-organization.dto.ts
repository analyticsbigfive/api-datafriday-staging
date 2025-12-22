import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsInt, IsEmail, IsPhoneNumber } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  organizationName: string;

  // Business Information (Required)
  @IsString()
  @IsNotEmpty()
  organizationType: string;  // Restaurant, Hotel, Bar, Event, etc.

  @IsEmail()
  @IsNotEmpty()
  organizationEmail: string;

  @IsString()
  @IsNotEmpty()
  organizationPhone: string;

  // Business Information (Optional)
  @IsString()
  @IsOptional()
  siret?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsInt()
  @IsOptional()
  numberOfEmployees?: number;

  @IsInt()
  @IsOptional()
  numberOfSpaces?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;  // Card, Transfer, Direct Debit
}
