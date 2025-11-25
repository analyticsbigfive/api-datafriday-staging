import { IsOptional, IsString, IsEnum } from 'class-validator';
import { TenantPlan } from '@prisma/client';

export class UpdateOrganizationDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    logo?: string;

    @IsOptional()
    @IsEnum(TenantPlan)
    plan?: TenantPlan;
}
