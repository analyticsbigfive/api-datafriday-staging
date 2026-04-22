import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { WeezeventConfigDto } from '../dto/weezevent-config.dto';
import {
    CreateWeezeventInstanceDto,
    UpdateWeezeventInstanceDto,
} from '../dto/weezevent-instance.dto';

type PublicInstance = {
    id: string;
    name: string;
    clientId: string;
    organizationId: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
};

@Injectable()
export class WeezeventIntegrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) { }

    // ==================== Multi-instance API ====================

    async listInstances(tenantId: string): Promise<PublicInstance[]> {
        await this.assertTenant(tenantId);
        return this.prisma.weezeventIntegration.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                clientId: true,
                organizationId: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    async getInstance(tenantId: string, instanceId: string): Promise<PublicInstance> {
        const row = await this.prisma.weezeventIntegration.findFirst({
            where: { id: instanceId, tenantId },
            select: {
                id: true,
                name: true,
                clientId: true,
                organizationId: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }
        return row;
    }

    /**
     * Returns decrypted credentials for an instance. Internal use (e.g. testing).
     */
    async getDecryptedCredentials(
        tenantId: string,
        instanceId: string,
    ): Promise<{ clientId: string; clientSecret: string }> {
        const row = await this.prisma.weezeventIntegration.findFirst({
            where: { id: instanceId, tenantId },
            select: { clientId: true, clientSecret: true },
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }
        return {
            clientId: row.clientId,
            clientSecret: this.encryptionService.decrypt(row.clientSecret),
        };
    }

    async createInstance(
        tenantId: string,
        dto: CreateWeezeventInstanceDto,
    ): Promise<PublicInstance> {
        await this.assertTenant(tenantId);

        const created = await this.prisma.weezeventIntegration.create({
            data: {
                tenantId,
                name: dto.name.trim(),
                clientId: dto.clientId.trim(),
                clientSecret: this.encryptionService.encrypt(dto.clientSecret),
                organizationId: dto.organizationId?.trim() || null,
                enabled: dto.enabled ?? true,
            },
            select: {
                id: true,
                name: true,
                clientId: true,
                organizationId: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await this.mirrorActiveInstanceToTenant(tenantId);
        return created;
    }

    async updateInstance(
        tenantId: string,
        instanceId: string,
        dto: UpdateWeezeventInstanceDto,
    ): Promise<PublicInstance> {
        const existing = await this.prisma.weezeventIntegration.findFirst({
            where: { id: instanceId, tenantId },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        const data: any = {};
        if (dto.name !== undefined) data.name = dto.name.trim();
        if (dto.clientId !== undefined) data.clientId = dto.clientId.trim();
        if (dto.clientSecret) {
            data.clientSecret = this.encryptionService.encrypt(dto.clientSecret);
        }
        if (dto.organizationId !== undefined) {
            data.organizationId = dto.organizationId?.trim() || null;
        }
        if (dto.enabled !== undefined) data.enabled = dto.enabled;

        const updated = await this.prisma.weezeventIntegration.update({
            where: { id: instanceId },
            data,
            select: {
                id: true,
                name: true,
                clientId: true,
                organizationId: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await this.mirrorActiveInstanceToTenant(tenantId);
        return updated;
    }

    async deleteInstance(tenantId: string, instanceId: string): Promise<{ success: true }> {
        const existing = await this.prisma.weezeventIntegration.findFirst({
            where: { id: instanceId, tenantId },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        await this.prisma.weezeventIntegration.delete({ where: { id: instanceId } });
        await this.mirrorActiveInstanceToTenant(tenantId);
        return { success: true };
    }

    /**
     * Mirror the first enabled instance back to Tenant.weezevent* columns so the
     * existing sync/cron/webhook services (which read these columns) keep working.
     */
    private async mirrorActiveInstanceToTenant(tenantId: string): Promise<void> {
        const active = await this.prisma.weezeventIntegration.findFirst({
            where: { tenantId, enabled: true },
            orderBy: { createdAt: 'asc' },
        });

        if (active) {
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    weezeventClientId: active.clientId,
                    weezeventClientSecret: active.clientSecret, // already encrypted
                    weezeventOrganizationId: active.organizationId,
                    weezeventEnabled: true,
                },
            });
        } else {
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    weezeventClientId: null,
                    weezeventClientSecret: null,
                    weezeventOrganizationId: null,
                    weezeventEnabled: false,
                },
            });
        }
    }

    private async assertTenant(tenantId: string): Promise<void> {
        const org = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true },
        });
        if (!org) {
            throw new NotFoundException(`Organization ${tenantId} not found`);
        }
    }

    // ==================== Legacy single-config API (back-compat) ====================

    async updateConfig(tenantId: string, config: WeezeventConfigDto) {
        await this.assertTenant(tenantId);

        // Toggle-off case: just disable all instances
        if (
            config.weezeventEnabled === false &&
            !config.weezeventClientId &&
            !config.weezeventClientSecret
        ) {
            await this.prisma.weezeventIntegration.updateMany({
                where: { tenantId },
                data: { enabled: false },
            });
            await this.mirrorActiveInstanceToTenant(tenantId);
            return this.getConfig(tenantId);
        }

        const primary = await this.prisma.weezeventIntegration.findFirst({
            where: { tenantId },
            orderBy: { createdAt: 'asc' },
        });

        if (primary) {
            const data: any = {};
            if (config.weezeventClientId !== undefined) data.clientId = config.weezeventClientId;
            if (config.weezeventClientSecret) {
                data.clientSecret = this.encryptionService.encrypt(config.weezeventClientSecret);
            }
            if (config.weezeventOrganizationId !== undefined) {
                data.organizationId = config.weezeventOrganizationId || null;
            }
            if (config.weezeventEnabled !== undefined) data.enabled = config.weezeventEnabled;

            await this.prisma.weezeventIntegration.update({
                where: { id: primary.id },
                data,
            });
        } else {
            if (!config.weezeventClientId || !config.weezeventClientSecret) {
                throw new BadRequestException(
                    'Client ID and Client Secret are required to create a Weezevent integration',
                );
            }
            await this.prisma.weezeventIntegration.create({
                data: {
                    tenantId,
                    name: 'Weezevent',
                    clientId: config.weezeventClientId,
                    clientSecret: this.encryptionService.encrypt(config.weezeventClientSecret),
                    organizationId: config.weezeventOrganizationId || null,
                    enabled: config.weezeventEnabled ?? true,
                },
            });
        }

        await this.mirrorActiveInstanceToTenant(tenantId);
        return this.getConfig(tenantId);
    }

    async getConfig(tenantId: string) {
        await this.assertTenant(tenantId);

        const primary =
            (await this.prisma.weezeventIntegration.findFirst({
                where: { tenantId, enabled: true },
                orderBy: { createdAt: 'asc' },
            })) ??
            (await this.prisma.weezeventIntegration.findFirst({
                where: { tenantId },
                orderBy: { createdAt: 'asc' },
            }));

        if (primary) {
            return {
                clientId: primary.clientId,
                organizationId: primary.organizationId,
                enabled: primary.enabled,
                configured: true,
            };
        }

        // Fallback to legacy tenant columns (e.g. mid-migration)
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                weezeventClientId: true,
                weezeventOrganizationId: true,
                weezeventEnabled: true,
            },
        });

        return {
            clientId: tenant?.weezeventClientId ?? null,
            organizationId: tenant?.weezeventOrganizationId ?? null,
            enabled: tenant?.weezeventEnabled ?? false,
            configured: !!tenant?.weezeventClientId,
        };
    }
}
