import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { WeezeventConfigDto } from '../dto/weezevent-config.dto';

@Injectable()
export class WeezeventIntegrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) { }

    /**
     * Update Weezevent configuration
     */
    async updateConfig(organizationId: string, config: WeezeventConfigDto) {
        // Verify organization exists
        const org = await this.prisma.tenant.findUnique({
            where: { id: organizationId },
        });

        if (!org) {
            throw new NotFoundException(`Organization ${organizationId} not found`);
        }

        // Encrypt client secret if provided
        const data: any = {};

        if (config.weezeventClientId !== undefined) {
            data.weezeventClientId = config.weezeventClientId;
        }

        if (config.weezeventClientSecret) {
            data.weezeventClientSecret = this.encryptionService.encrypt(
                config.weezeventClientSecret,
            );
        }

        if (config.weezeventOrganizationId !== undefined) {
            data.weezeventOrganizationId = config.weezeventOrganizationId;
        }

        if (config.weezeventEnabled !== undefined) {
            data.weezeventEnabled = config.weezeventEnabled;
        }

        return this.prisma.tenant.update({
            where: { id: organizationId },
            data,
            select: {
                id: true,
                name: true,
                slug: true,
                weezeventClientId: true,
                weezeventOrganizationId: true,
                weezeventEnabled: true,
                // Never return encrypted secret
            },
        });
    }

    /**
     * Get Weezevent configuration (public)
     */
    async getConfig(organizationId: string) {
        const org = await this.prisma.tenant.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                weezeventClientId: true,
                weezeventOrganizationId: true,
                weezeventEnabled: true,
            },
        });

        if (!org) {
            throw new NotFoundException(`Organization ${organizationId} not found`);
        }

        return {
            clientId: org.weezeventClientId,
            organizationId: org.weezeventOrganizationId,
            enabled: org.weezeventEnabled,
            configured: !!org.weezeventClientId,
        };
    }
}
