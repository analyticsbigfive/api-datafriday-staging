import { IsOptional, IsInt, Min, Max, IsEnum, IsDateString, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTransactionsQueryDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Type(() => Number)
    perPage?: number = 50;

    @IsOptional()
    @IsEnum(['W', 'V', 'C', 'R'])
    status?: 'W' | 'V' | 'C' | 'R';

    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @IsOptional()
    @IsDateString()
    toDate?: string;

    @IsOptional()
    @IsString()
    eventId?: string;

    @IsOptional()
    @IsString()
    merchantId?: string;
}
