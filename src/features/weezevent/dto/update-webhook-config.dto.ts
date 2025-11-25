import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateWebhookConfigDto {
    @IsOptional()
    @IsString()
    weezeventWebhookSecret?: string;

    @IsOptional()
    @IsBoolean()
    weezeventWebhookEnabled?: boolean;
}
