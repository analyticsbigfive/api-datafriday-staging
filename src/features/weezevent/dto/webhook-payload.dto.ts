import { IsString, IsIn, IsObject, IsOptional } from 'class-validator';

export class WeezeventWebhookPayloadDto {
    @IsString()
    @IsIn(['transaction', 'wallet', 'refill', 'scan', 'transfer'])
    type: string;

    @IsString()
    @IsIn(['create', 'update', 'delete'])
    method: string;

    @IsObject()
    data: any;

    @IsOptional()
    @IsString()
    timestamp?: string;
}
