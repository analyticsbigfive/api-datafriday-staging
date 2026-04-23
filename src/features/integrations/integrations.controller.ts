import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventAuthService } from '../weezevent/services/weezevent-auth.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';
import {
    CreateWeezeventInstanceDto,
    UpdateWeezeventInstanceDto,
    TestWeezeventInstanceDto,
} from './dto/weezevent-instance.dto';

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
    async listIntegrations(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        const [weezevent, webhooks] = await Promise.all([
            this.weezeventService.getConfig(tenantId),
            this.webhookService.getConfig(tenantId),
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
        @CurrentUser() user: any,
        @Body() dto: WeezeventConfigDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
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

        return this.weezeventService.updateConfig(tenantId, dto);
    }

    /**
     * Get Weezevent configuration
     */
    @Get('weezevent')
    @ApiOperation({ summary: 'Obtenir la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent' })
    async getWeezeventConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.getConfig(this.resolveTenantId(user, organizationId));
    }

    // ==================== Multi-instance Weezevent ====================

    @Get('weezevent/instances')
    @ApiOperation({ summary: 'Lister les instances Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    async listWeezeventInstances(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.listInstances(this.resolveTenantId(user, organizationId));
    }

    @Post('weezevent/instances')
    @ApiOperation({ summary: 'Créer une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    async createWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        // Validate credentials before persisting
        const result = await this.weezeventAuthService.testCredentials(
            dto.clientId,
            dto.clientSecret,
        );
        if (!result.valid) {
            throw new BadRequestException(
                `Cannot save: Weezevent credentials are invalid (${result.error})`,
            );
        }

        return this.weezeventService.createInstance(tenantId, dto);
    }

    @Patch('weezevent/instances/:instanceId')
    @ApiOperation({ summary: 'Mettre à jour une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    async updateWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: UpdateWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        const needsValidation =
            dto.clientId !== undefined || dto.clientSecret !== undefined;

        if (needsValidation) {
            let clientId = dto.clientId;
            let clientSecret = dto.clientSecret;

            if (!clientId || !clientSecret) {
                const stored = await this.weezeventService.getDecryptedCredentials(
                    tenantId,
                    instanceId,
                );
                if (!clientId) clientId = stored.clientId;
                if (!clientSecret) clientSecret = stored.clientSecret;
            }

            const result = await this.weezeventAuthService.testCredentials(
                clientId!,
                clientSecret!,
            );
            if (!result.valid) {
                throw new BadRequestException(
                    `Cannot save: Weezevent credentials are invalid (${result.error})`,
                );
            }
        }

        return this.weezeventService.updateInstance(tenantId, instanceId, dto);
    }

    @Delete('weezevent/instances/:instanceId')
    @ApiOperation({ summary: 'Supprimer une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    async deleteWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.deleteInstance(this.resolveTenantId(user, organizationId), instanceId);
    }

    @Post('weezevent/instances/:instanceId/test')
    @ApiOperation({ summary: 'Tester les credentials d\'une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    async testWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: TestWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        let clientId = dto.clientId;
        let clientSecret = dto.clientSecret;

        if (!clientId || !clientSecret) {
            const stored = await this.weezeventService.getDecryptedCredentials(
                tenantId,
                instanceId,
            );
            if (!clientId) clientId = stored.clientId;
            if (!clientSecret) clientSecret = stored.clientSecret;
        }

        const result = await this.weezeventAuthService.testCredentials(clientId, clientSecret);
        if (!result.valid) {
            throw new BadRequestException(`Invalid credentials: ${result.error}`);
        }
        return { valid: true, message: 'Connection successful' };
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
        @CurrentUser() user: any,
        @Body() dto: WebhookConfigDto,
    ) {
        return this.webhookService.updateConfig(this.resolveTenantId(user, organizationId), dto);
    }

    /**
     * Get webhook configuration
     */
    @Get('webhooks')
    @ApiOperation({ summary: 'Obtenir la configuration des webhooks' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Configuration webhook' })
    async getWebhookConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.webhookService.getConfig(this.resolveTenantId(user, organizationId));
    }

    /**
     * Enforce that the authenticated user can only access their own organization.
     * The organizationId URL param is accepted only when it matches the JWT tenantId,
     * preventing IDOR attacks (OWASP A01).
     */
    private resolveTenantId(user: any, organizationId: string): string {
        const jwtTenantId: string | undefined = user?.tenantId;
        if (!jwtTenantId) {
            throw new ForbiddenException('No organization associated with this account');
        }
        if (organizationId && organizationId !== jwtTenantId) {
            throw new ForbiddenException('Access denied to this organization');
        }
        return jwtTenantId;
    }
}
