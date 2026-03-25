import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
    private readonly logger = new Logger(OrganizationsService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get organization by ID
     */
    async getOrganization(id: string) {
        this.logger.log(`Fetching organization ${id}`);
        const organization = await this.prisma.tenant.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                domain: true,
                logo: true,
                plan: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!organization) {
            this.logger.warn(`Organization ${id} not found`);
            throw new NotFoundException(`Organization with ID ${id} not found`);
        }

        return organization;
    }

    /**
     * Update organization
     */
    async updateOrganization(id: string, dto: UpdateOrganizationDto) {
        this.logger.log(`Updating organization ${id}`);
        await this.getOrganization(id);

        try {
            const result = await this.prisma.tenant.update({
                where: { id },
                data: dto,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    domain: true,
                    logo: true,
                    plan: true,
                    status: true,
                    updatedAt: true,
                },
            });
            this.logger.log(`Organization ${id} updated`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to update organization ${id}: ${error.message}`, error.stack);
            if (error.code === 'P2025') {
                throw new NotFoundException(`Organization with ID ${id} not found`);
            }
            throw error;
        }
    }

    /**
     * Delete organization (soft delete)
     */
    async deleteOrganization(id: string) {
        this.logger.log(`Suspending organization ${id}`);
        await this.getOrganization(id);

        try {
            const result = await this.prisma.tenant.update({
                where: { id },
                data: {
                    status: 'SUSPENDED',
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                },
            });
            this.logger.log(`Organization ${id} suspended`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to suspend organization ${id}: ${error.message}`, error.stack);
            if (error.code === 'P2025') {
                throw new NotFoundException(`Organization with ID ${id} not found`);
            }
            throw error;
        }
    }
}
