import { IsOptional, IsEnum, IsDateString, IsBoolean, IsInt, Min, Max, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SyncWeezeventDto {
    @ApiProperty({ description: 'ID de l\'intégration Weezevent à synchroniser', example: 'clxyz...' })
    @IsString()
    @IsNotEmpty()
    integrationId: string;

    @ApiProperty({
        description: 'Type de données à synchroniser',
        enum: ['transactions', 'events', 'products', 'orders', 'prices', 'attendees'],
        example: 'transactions',
    })
    @IsEnum(['transactions', 'events', 'products', 'orders', 'prices', 'attendees'])
    type: 'transactions' | 'events' | 'products' | 'orders' | 'prices' | 'attendees';

    @ApiPropertyOptional({ description: 'Forcer une synchronisation complète (ignore l\'état incrémental)', example: false })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    full?: boolean;

    @ApiPropertyOptional({ description: 'Date de début pour les transactions (ISO 8601)', example: '2025-01-01T00:00:00Z' })
    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @ApiPropertyOptional({ description: 'Date de fin pour les transactions (ISO 8601)', example: '2025-12-31T23:59:59Z' })
    @IsOptional()
    @IsDateString()
    toDate?: string;

    @ApiPropertyOptional({ description: 'ID événement Weezevent — requis pour orders et attendees', example: '42' })
    @IsOptional()
    @IsString()
    eventId?: string;
}
