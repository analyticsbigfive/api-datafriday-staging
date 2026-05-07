import { IsOptional, IsInt, Min, Max, IsEnum, IsDateString, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetTransactionsQueryDto {
    @ApiProperty({ description: 'ID de l\'intégration Weezevent', example: 'clxyz...' })
    @IsString()
    @IsNotEmpty()
    integrationId: string;

    @ApiPropertyOptional({ description: 'Numéro de page', default: 1, minimum: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Nombre de résultats par page', default: 50, minimum: 1, maximum: 100 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    perPage?: number = 50;

    @ApiPropertyOptional({
        description: 'Filtrer par statut de transaction',
        enum: ['W', 'V', 'C', 'R'],
        enumName: 'WeezeventTransactionStatus',
        example: 'V',
    })
    @IsOptional()
    @IsEnum(['W', 'V', 'C', 'R'])
    status?: 'W' | 'V' | 'C' | 'R';

    @ApiPropertyOptional({ description: 'Date de début (ISO 8601)', example: '2025-01-01T00:00:00Z' })
    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @ApiPropertyOptional({ description: 'Date de fin (ISO 8601)', example: '2025-12-31T23:59:59Z' })
    @IsOptional()
    @IsDateString()
    toDate?: string;

    @ApiPropertyOptional({ description: 'Filtrer par ID événement Weezevent', example: '42' })
    @IsOptional()
    @IsString()
    eventId?: string;

    @ApiPropertyOptional({ description: 'Filtrer par ID merchant Weezevent', example: '99' })
    @IsOptional()
    @IsString()
    merchantId?: string;
}
