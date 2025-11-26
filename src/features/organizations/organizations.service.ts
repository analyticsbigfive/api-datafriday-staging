import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get organization by ID
     */
    async getOrganization(id: string) {
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
            throw new NotFoundException(`Organization ${id} not found`);
        }

        return organization;
    }

    /**
     * Update organization
     */
    async updateOrganization(id: string, dto: UpdateOrganizationDto) {
        // Verify organization exists
        await this.getOrganization(id);

        return this.prisma.tenant.update({
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
    }

    /**
     * Delete organization (soft delete)
     */
    async deleteOrganization(id: string) {
        // Verify organization exists
        await this.getOrganization(id);

        return this.prisma.tenant.update({
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
    }
}
