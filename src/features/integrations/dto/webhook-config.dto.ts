import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class WebhookConfigDto {
    @IsOptional()
    @IsString()
    weezeventWebhookSecret?: string;

    @IsOptional()
    @IsBoolean()
    weezeventWebhookEnabled?: boolean;
}
