import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class UpdateWeezeventConfigDto {
    @IsString()
    @MinLength(10, { message: 'Client ID must be at least 10 characters' })
    weezeventClientId: string;

    @IsString()
    @MinLength(20, { message: 'Client Secret must be at least 20 characters' })
    weezeventClientSecret: string;

    @IsString()
    @IsOptional()
    weezeventOrganizationId?: string;

    @IsBoolean()
    @IsOptional()
    weezeventEnabled?: boolean;
}
