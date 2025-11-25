import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-database.guard';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';

@Controller('organizations/:organizationId/integrations')
@UseGuards(JwtDatabaseGuard)
export class IntegrationsController {
    constructor(
        private readonly weezeventService: WeezeventIntegrationService,
        private readonly webhookService: WebhookIntegrationService,
    ) { }

    /**
     * List all integrations
     */
    @Get()
    async listIntegrations(@Param('organizationId') organizationId: string) {
        const [weezevent, webhooks] = await Promise.all([
            this.weezeventService.getConfig(organizationId),
            this.webhookService.getConfig(organizationId),
        ]);

        return {
            weezevent,
            webhooks,
        };
    }

    /**
     * Update Weezevent configuration
     */
    @Patch('weezevent')
    async updateWeezeventConfig(
        @Param('organizationId') organizationId: string,
        @Body() dto: WeezeventConfigDto,
    ) {
        return this.weezeventService.updateConfig(organizationId, dto);
    }

    /**
     * Get Weezevent configuration
     */
    @Get('weezevent')
    async getWeezeventConfig(@Param('organizationId') organizationId: string) {
        return this.weezeventService.getConfig(organizationId);
    }

    /**
     * Update webhook configuration
     */
    @Patch('webhooks')
    async updateWebhookConfig(
        @Param('organizationId') organizationId: string,
        @Body() dto: WebhookConfigDto,
    ) {
        return this.webhookService.updateConfig(organizationId, dto);
    }

    /**
     * Get webhook configuration
     */
    @Get('webhooks')
    async getWebhookConfig(@Param('organizationId') organizationId: string) {
        return this.webhookService.getConfig(organizationId);
    }
}
