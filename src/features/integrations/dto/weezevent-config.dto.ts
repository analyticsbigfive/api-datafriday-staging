import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class WeezeventConfigDto {
    @IsOptional()
    @IsString()
    weezeventClientId?: string;

    @IsOptional()
    @IsString()
    weezeventClientSecret?: string;

    @IsOptional()
    @IsString()
    weezeventOrganizationId?: string;

    @IsOptional()
    @IsBoolean()
    weezeventEnabled?: boolean;
}
