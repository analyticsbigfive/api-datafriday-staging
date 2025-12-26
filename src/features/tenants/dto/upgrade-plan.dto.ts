import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TenantPlan } from '@prisma/client';

export class UpgradePlanDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  billingEmail?: string;
}
