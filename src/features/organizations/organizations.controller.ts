import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@ApiTags('Organizations')
@ApiBearerAuth('supabase-jwt')
@Controller('organizations')
@UseGuards(JwtDatabaseGuard)
export class OrganizationsController {
    constructor(
        private readonly organizationsService: OrganizationsService,
    ) { }

    @Get(':id')
    @ApiOperation({ summary: 'Obtenir une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Détails de l’organisation' })
    async getOrganization(@Param('id') id: string) {
        return this.organizationsService.getOrganization(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Mettre à jour une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Organisation mise à jour' })
    async updateOrganization(
        @Param('id') id: string,
        @Body() dto: UpdateOrganizationDto,
    ) {
        return this.organizationsService.updateOrganization(id, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Supprimer une organisation' })
    @ApiParam({ name: 'id', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Organisation supprimée' })
    async deleteOrganization(@Param('id') id: string) {
        return this.organizationsService.deleteOrganization(id);
    }
}
