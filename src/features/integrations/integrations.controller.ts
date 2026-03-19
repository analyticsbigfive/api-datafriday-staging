import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';

@ApiTags('Integrations')
@ApiBearerAuth('supabase-jwt')
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
    @ApiOperation({ summary: 'Lister les intégrations d’une organisation' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration des intégrations disponibles' })
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
    @ApiOperation({ summary: 'Mettre à jour la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent mise à jour' })
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
    @ApiOperation({ summary: 'Obtenir la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent' })
    async getWeezeventConfig(@Param('organizationId') organizationId: string) {
        return this.weezeventService.getConfig(organizationId);
    }

    /**
     * Update webhook configuration
     */
    @Patch('webhooks')
    @ApiOperation({ summary: 'Mettre à jour la configuration des webhooks' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration webhook mise à jour' })
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
    @ApiOperation({ summary: 'Obtenir la configuration des webhooks' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration webhook' })
    async getWebhookConfig(@Param('organizationId') organizationId: string) {
        return this.webhookService.getConfig(organizationId);
    }
}
