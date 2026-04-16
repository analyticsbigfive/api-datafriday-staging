import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventAuthService } from '../weezevent/services/weezevent-auth.service';
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
        private readonly weezeventAuthService: WeezeventAuthService,
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
     * Test Weezevent credentials without saving
     */
    @Post('weezevent/test')
    @ApiOperation({ summary: 'Tester les credentials Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Résultat du test de connexion' })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    async testWeezeventCredentials(
        @Body() dto: WeezeventConfigDto,
    ) {
        if (!dto.weezeventClientId || !dto.weezeventClientSecret) {
            throw new BadRequestException('Client ID and Client Secret are required');
        }

        const result = await this.weezeventAuthService.testCredentials(
            dto.weezeventClientId,
            dto.weezeventClientSecret,
        );

        if (!result.valid) {
            throw new BadRequestException(`Invalid credentials: ${result.error}`);
        }

        return { valid: true, message: 'Connection successful' };
    }

    /**
     * Update Weezevent configuration (validates credentials first)
     */
    @Patch('weezevent')
    @ApiOperation({ summary: 'Mettre à jour la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent mise à jour' })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    async updateWeezeventConfig(
        @Param('organizationId') organizationId: string,
        @Body() dto: WeezeventConfigDto,
    ) {
        // Validate credentials before saving if both clientId and clientSecret provided
        if (dto.weezeventClientId && dto.weezeventClientSecret) {
            const result = await this.weezeventAuthService.testCredentials(
                dto.weezeventClientId,
                dto.weezeventClientSecret,
            );
            if (!result.valid) {
                throw new BadRequestException(
                    `Cannot save: Weezevent credentials are invalid (${result.error})`,
                );
            }
        }

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
