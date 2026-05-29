import { IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartSyncJobDto {
    @ApiProperty({ description: 'ID de l\'intégration Weezevent', example: 'cmp5tfhjy0agr3kle34zrlcud' })
    @IsString()
    @IsNotEmpty()
    integrationId: string;

    @ApiProperty({ description: 'Date de début — YYYY-MM-DD ou ISO 8601', example: '2026-01-01' })
    @IsDateString()
    fromDate: string;

    @ApiProperty({ description: 'Date de fin — YYYY-MM-DD ou ISO 8601', example: '2026-05-31' })
    @IsDateString()
    toDate: string;
}
