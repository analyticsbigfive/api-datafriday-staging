import { IsString, IsBoolean, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateWeezeventInstanceDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    @IsString()
    @MinLength(1)
    clientId!: string;

    @IsString()
    @MinLength(1)
    clientSecret!: string;

    @IsString()
    @MinLength(1)
    organizationId!: string;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}

export class UpdateWeezeventInstanceDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    clientId?: string;

    // Optional on update: keep existing secret if not provided
    @IsOptional()
    @IsString()
    @MinLength(1)
    clientSecret?: string;

    @IsOptional()
    @IsString()
    organizationId?: string;

    @IsOptional()
    @IsBoolean()
    enabled?: boolean;
}

export class TestWeezeventInstanceDto {
    @IsOptional()
    @IsString()
    clientId?: string;

    @IsOptional()
    @IsString()
    clientSecret?: string;
}
