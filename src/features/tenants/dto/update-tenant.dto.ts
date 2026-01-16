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
import { TenantPlan, TenantStatus } from '@prisma/client';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  organizationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  siret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfEmployees?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  numberOfSpaces?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  // Weezevent Integration
  @IsOptional()
  @IsBoolean()
  weezeventEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  weezeventOrganizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  weezeventClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  weezeventClientSecret?: string;
}
