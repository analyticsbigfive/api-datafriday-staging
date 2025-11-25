import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WebhookConfigDto } from '../dto/webhook-config.dto';

@Injectable()
export class WebhookIntegrationService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Update webhook configuration
     */
    async updateConfig(organizationId: string, config: WebhookConfigDto) {
        // Verify organization exists
        const org = await this.prisma.tenant.findUnique({
            where: { id: organizationId },
        });

        if (!org) {
            throw new NotFoundException(`Organization ${organizationId} not found`);
        }

        return this.prisma.tenant.update({
            where: { id: organizationId },
            data: {
                weezeventWebhookSecret: config.weezeventWebhookSecret,
                weezeventWebhookEnabled: config.weezeventWebhookEnabled,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                weezeventWebhookEnabled: true,
                // Never return secret
            },
        });
    }

    /**
     * Get webhook configuration (public)
     */
    async getConfig(organizationId: string) {
        const org = await this.prisma.tenant.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                weezeventWebhookEnabled: true,
            },
        });

        if (!org) {
            throw new NotFoundException(`Organization ${organizationId} not found`);
        }

        return {
            enabled: org.weezeventWebhookEnabled,
            configured: !!org.weezeventWebhookEnabled,
        };
    }
}
