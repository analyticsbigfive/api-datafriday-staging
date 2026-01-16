import { IsOptional, IsEnum, IsDateString, IsBoolean, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncWeezeventDto {
    @IsEnum(['transactions', 'wallets', 'users', 'events', 'products'])
    type: 'transactions' | 'wallets' | 'users' | 'events' | 'products';

    @IsOptional()
    @IsString()
    tenantId?: string;

    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @IsOptional()
    @IsDateString()
    toDate?: string;

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    full?: boolean;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    eventId?: number;
}
