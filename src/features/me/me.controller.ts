import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';

@Controller('me')
@UseGuards(JwtDatabaseGuard)
export class MeController {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get current user with their organization
     */
    @Get()
    async getCurrentUser(@CurrentUser() user: any) {
        const dbUser = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                email: true,
                role: true,
                tenantId: true,
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        plan: true,
                        status: true,
                    },
                },
            },
        });

        return dbUser;
    }
}
