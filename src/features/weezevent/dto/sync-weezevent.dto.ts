import { IsOptional, IsEnum, IsDateString, IsBoolean, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncWeezeventDto {
    @IsEnum(['transactions', 'wallets', 'users', 'events', 'products', 'orders', 'prices', 'attendees'])
    type: 'transactions' | 'wallets' | 'users' | 'events' | 'products' | 'orders' | 'prices' | 'attendees';

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
    @IsString()
    eventId?: string;
}
