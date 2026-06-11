import { Controller, Get, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser, CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';

@ApiTags('Me')
@ApiBearerAuth('supabase-jwt')
@Controller('me')
@UseGuards(JwtDatabaseGuard)
export class MeController {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get current user with their organization
     */
    @Get()
    @ApiOperation({
        summary: 'Obtenir le profil utilisateur courant',
        description: 'Retourne les informations de l\'utilisateur connecté avec son organisation.',
    })
    @ApiResponse({
        status: 200,
        description: 'Profil utilisateur',
        schema: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                fullName: { type: 'string' },
                tenantId: { type: 'string' },
                isOwner: { type: 'boolean' },
                tenant: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        slug: { type: 'string' },
                        plan: { type: 'string' },
                        status: { type: 'string' },
                    },
                },
                role: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', nullable: true },
                        name: { type: 'string', nullable: true },
                        systemKey: { type: 'string', enum: ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'], nullable: true },
                        isSystem: { type: 'boolean' },
                        permissions: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    @ApiResponse({ status: 404, description: 'Utilisateur non trouvé en base (nécessite onboarding)' })
    async getCurrentUser(@CurrentUser() user: CurrentUserData) {
        if (!user.tenantId) {
            throw new NotFoundException('Utilisateur non trouvé en base (nécessite onboarding)');
        }

        return user;
    }

    /**
     * Get current user's tenant/organization
     */
    @Get('tenant')
    @ApiOperation({
        summary: 'Obtenir l\'organisation de l\'utilisateur courant',
        description: 'Retourne les détails complets de l\'organisation à laquelle appartient l\'utilisateur.',
    })
    @ApiResponse({
        status: 200,
        description: 'Détails de l\'organisation',
    })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    @ApiResponse({ status: 404, description: 'Aucune organisation associée' })
    async getCurrentUserTenant(@CurrentUser() user: any) {
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            include: {
                tenant: true,
            },
        });

        if (!dbUser?.tenant) {
            throw new NotFoundException('Aucune organisation associée à cet utilisateur');
        }

        return dbUser.tenant;
    }
}
